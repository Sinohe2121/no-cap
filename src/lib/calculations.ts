import prisma from '@/lib/prisma';

export interface PeriodCostResult {
    developerId: string;
    developerName: string;
    totalPoints: number;
    capPoints: number;
    expPoints: number;
    capRatio: number;
    loadedCost: number;        // gross fully-loaded cost (before meeting adjustment)
    meetingAdjustment: number; // loadedCost × meetingTimeRate
    netCost: number;           // loadedCost − meetingAdjustment — used for ticket allocation
    allocatedAmount: number;
    expensedAmount: number;
    projectBreakdown: {
        projectId: string;
        projectName: string;
        points: number;
        amount: number;
        isCapitalizable: boolean;
        bugPoints: number;   // story points from BUG tickets
        taskPoints: number;  // story points from TASK/EPIC/SUBTASK tickets
        bugAmount: number;   // developer cost attributable to bugs
        taskAmount: number;  // developer cost attributable to tasks/epics/subtasks
    }[];
}

/**
 * Ticket selection: "open during the period"
 *   1. Tickets with NO resolutionDate (still open — developer is actively working)
 *   2. Tickets resolved DURING the period (was open at period start, closed during the month)
 *
 * Tickets closed BEFORE the period are excluded — they're no longer being worked on.
 */
export async function calculatePeriodCosts(month: number, year: number): Promise<PeriodCostResult[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const developers = await prisma.developer.findMany({ where: { isActive: true } });

    const [fringeConfig, standardConfig, meetingConfig, bugSpConfig, otherSpConfig] = await Promise.all([
        prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
        prisma.globalConfig.findUnique({ where: { key: 'ACCOUNTING_STANDARD' } }),
        prisma.globalConfig.findUnique({ where: { key: 'MEETING_TIME_RATE' } }),
        prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
        prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
    ]);
    const globalFringeRate   = fringeConfig  ? parseFloat(fringeConfig.value)  : 0.25;
    const accountingStandard = standardConfig?.value || 'ASC_350_40';
    const globalMeetingRate  = meetingConfig  ? parseFloat(meetingConfig.value)  : 0;
    const bugSpFallback      = parseFloat(bugSpConfig?.value  ?? '1') || 1;
    const otherSpFallback    = parseFloat(otherSpConfig?.value ?? '1') || 1;

    /** Applied SP: uses Jira value if > 0, otherwise returns the appropriate fallback */
    const appliedSP = (ticket: { storyPoints: number; issueType: string }) =>
        ticket.storyPoints > 0
            ? ticket.storyPoints
            : ticket.issueType.toUpperCase() === 'BUG' ? bugSpFallback : otherSpFallback;


    // Fetch payroll imports for this period to get actual salary data
    const payrollImports = await prisma.payrollImport.findMany({
        where: {
            payDate: { gte: startDate, lte: endDate },
        },
        include: { entries: { select: { developerId: true, grossSalary: true } } },
    });

    const payrollSalaryByDev: Record<string, number> = {};
    for (const imp of payrollImports) {
        for (const entry of imp.entries) {
            payrollSalaryByDev[entry.developerId] = (payrollSalaryByDev[entry.developerId] || 0) + entry.grossSalary;
        }
    }

    // ─── NEW TICKET SELECTION ───────────────────────────────────────
    // "Open during the period" = still open OR resolved during this month
    // Excludes tickets resolved BEFORE the period (no longer being worked on)
    const allTickets = await prisma.jiraTicket.findMany({
        where: {
            assigneeId: { in: developers.map((d) => d.id) },
            OR: [
                { resolutionDate: null },                                          // still open
                { resolutionDate: { gte: startDate, lte: endDate } },             // closed during period
            ],
        },
        include: { project: true },
    });

    // Group by developer id
    const ticketsByDev = new Map<string, typeof allTickets>();
    for (const ticket of allTickets) {
        if (!ticket.assigneeId) continue;
        const existing = ticketsByDev.get(ticket.assigneeId) ?? [];
        existing.push(ticket);
        ticketsByDev.set(ticket.assigneeId, existing);
    }

    const results: PeriodCostResult[] = [];

    for (const dev of developers) {
        // Always compute payroll cost — even if the dev has no tickets this period.
        // Their payroll must still be captured; it will go to the UNALLOCATED bucket.
        const fringeRate = dev.fringeBenefitRate ?? globalFringeRate;
        const salary = payrollSalaryByDev[dev.id] ?? dev.monthlySalary ?? 0;
        const sbc = dev.stockCompAllocation ?? 0;
        const loadedCost = salary + (salary * fringeRate) + sbc;
        const meetingAdjustment = loadedCost * globalMeetingRate;
        const netCost = loadedCost - meetingAdjustment;

        if (loadedCost <= 0) continue; // truly zero-cost dev (e.g. not in payroll and no base salary)

        const tickets = ticketsByDev.get(dev.id) ?? [];
        const totalPoints = tickets.reduce((sum, t) => sum + appliedSP(t), 0);

        // If no tickets at all, all cost is unallocated expense
        if (tickets.length === 0 || totalPoints === 0) {
            results.push({
                developerId: dev.id,
                developerName: dev.name,
                totalPoints: 0,
                capPoints: 0,
                expPoints: 0,
                capRatio: 0,
                loadedCost,
                meetingAdjustment,
                netCost,
                allocatedAmount: 0,
                expensedAmount: netCost,
                projectBreakdown: [{
                    projectId: '__UNALLOCATED__',
                    projectName: 'Unallocated Labor',
                    points: 0,
                    isCapitalizable: false,
                    bugPoints: 0,
                    taskPoints: 1, // non-zero so taskAmount gets computed
                    amount: netCost,
                    bugAmount: 0,
                    taskAmount: netCost,
                }],
            });
            continue;
        }

        const projectMap: Record<string, { projectId: string; projectName: string; points: number; isCapitalizable: boolean; bugPoints: number; taskPoints: number }> = {};

        let capPoints = 0;
        let expPoints = 0;

        for (const ticket of tickets) {
            const issueType = ticket.issueType.toUpperCase();

            // Tickets with no project go to UNALLOCATED bucket
            if (!ticket.project || !ticket.projectId) {
                const key = '__UNALLOCATED__::exp';
                if (!projectMap[key]) {
                    projectMap[key] = {
                        projectId: '__UNALLOCATED__',
                        projectName: 'Unallocated Labor',
                        points: 0,
                        isCapitalizable: false,
                        bugPoints: 0,
                        taskPoints: 0,
                    };
                }
                const sp = appliedSP(ticket);
                projectMap[key].points += sp;
                expPoints += sp;
                if (issueType === 'BUG') {
                    projectMap[key].bugPoints += sp;
                } else {
                    projectMap[key].taskPoints += sp;
                }
                continue;
            }

            const proj = ticket.project;

            // ── Capitalization rule based on active accounting standard ────
            let isCapitalizableTicket = false;

            if (accountingStandard === 'ASU_2025_06') {
                isCapitalizableTicket =
                    issueType === 'STORY' &&
                    ticket.project.isCapitalizable &&
                    ticket.project.status === 'DEV' &&
                    ((proj as Record<string, unknown>).mgmtAuthorized ?? false) === true &&
                    ((proj as Record<string, unknown>).probableToComplete ?? false) === true;
            } else if (accountingStandard === 'IFRS') {
                isCapitalizableTicket =
                    ticket.project.isCapitalizable &&
                    (ticket.project.status === 'DEV' || ticket.project.status === 'LIVE');
            } else {
                // ASC 350-40 (default): STORY on a project flagged as capitalizable
                isCapitalizableTicket =
                    issueType === 'STORY' &&
                    ticket.project.isCapitalizable;
            }

            if (isCapitalizableTicket) {
                capPoints += appliedSP(ticket);
            } else {
                expPoints += appliedSP(ticket);
            }

            const key = `${ticket.projectId}::${isCapitalizableTicket ? 'cap' : 'exp'}`;
            if (!projectMap[key]) {
                projectMap[key] = {
                    projectId: ticket.projectId,
                    projectName: ticket.project.name,
                    points: 0,
                    isCapitalizable: isCapitalizableTicket,
                    bugPoints: 0,
                    taskPoints: 0,
                };
            }
            const sp = appliedSP(ticket);
            projectMap[key].points += sp;

            // In the 'exp' bucket, split into BUG vs everything-else (TASK).
            if (!isCapitalizableTicket) {
                if (issueType === 'BUG') {
                    projectMap[key].bugPoints += sp;
                } else {
                    projectMap[key].taskPoints += sp;
                }
            }
        }

        const capRatio = totalPoints > 0 ? capPoints / totalPoints : 0;
        const allocatedAmount = netCost * capRatio;
        const expensedAmount = netCost * (1 - capRatio);

        const projectBreakdown = Object.values(projectMap).map((p) => ({
            ...p,
            amount: (p.points / totalPoints) * netCost,
            bugAmount:  (p.bugPoints  / totalPoints) * netCost,
            taskAmount: (p.taskPoints / totalPoints) * netCost,
        }));

        results.push({
            developerId: dev.id,
            developerName: dev.name,
            totalPoints,
            capPoints,
            expPoints,
            capRatio,
            loadedCost,
            meetingAdjustment,
            netCost,
            allocatedAmount,
            expensedAmount,
            projectBreakdown,
        });
    }

    // ── TEMP DIAG ──
    console.log(`[CALC DIAG] month=${month} year=${year}`);
    console.log(`[CALC DIAG] active developers: ${developers.length}`);
    console.log(`[CALC DIAG] payroll imports found: ${payrollImports.length}, devs with payroll: ${Object.keys(payrollSalaryByDev).length}`);
    console.log(`[CALC DIAG] total tickets found: ${allTickets.length}`);
    console.log(`[CALC DIAG] results count: ${results.length}`);
    for (const r of results) {
        console.log(`[CALC DIAG]  dev=${r.developerName} loadedCost=${r.loadedCost} capRatio=${r.capRatio.toFixed(3)} allocAmt=${r.allocatedAmount.toFixed(2)} breakdown=${r.projectBreakdown.length} projects`);
        for (const p of r.projectBreakdown) {
            console.log(`[CALC DIAG]    proj=${p.projectName} isCap=${p.isCapitalizable} pts=${p.points} bugPts=${p.bugPoints} taskPts=${p.taskPoints} amt=${p.amount.toFixed(2)} bugAmt=${p.bugAmount.toFixed(2)} taskAmt=${p.taskAmount.toFixed(2)}`);
        }
    }
    // ── END TEMP DIAG ──

    return results;
}

/**
 * Calculate amortization for a SINGLE TICKET.
 *
 * Amortization starts the month AFTER the ticket's resolutionDate.
 * Monthly charge = allocatedAmount / amortizationMonths (straight-line).
 * Continues until net book value reaches $0.
 */
export function calculateTicketAmortization(
    allocatedAmount: number,
    amortizationMonths: number,
    resolutionDate: Date,
    asOfDate: Date,
): { monthlyAmortization: number; totalAmortization: number; nbv: number; monthsElapsed: number } {
    if (allocatedAmount <= 0 || amortizationMonths <= 0) {
        return { monthlyAmortization: 0, totalAmortization: 0, nbv: 0, monthsElapsed: 0 };
    }

    // Amortization starts the first of the month AFTER resolution
    const amortStart = new Date(resolutionDate.getFullYear(), resolutionDate.getMonth() + 1, 1);

    // If we haven't reached the amort start date yet, no amortization
    if (asOfDate < amortStart) {
        return { monthlyAmortization: 0, totalAmortization: 0, nbv: allocatedAmount, monthsElapsed: 0 };
    }

    const monthlyAmortization = allocatedAmount / amortizationMonths;

    // Months elapsed since amortization started (inclusive of asOfDate's month)
    const monthsElapsed = Math.max(0,
        (asOfDate.getFullYear() - amortStart.getFullYear()) * 12 +
        (asOfDate.getMonth() - amortStart.getMonth()) + 1
    );

    const cappedMonths = Math.min(monthsElapsed, amortizationMonths);
    const totalAmortization = monthlyAmortization * cappedMonths;
    const nbv = Math.max(0, allocatedAmount - totalAmortization);

    return { monthlyAmortization, totalAmortization, nbv, monthsElapsed: cappedMonths };
}

/**
 * Legacy project-level amortization — kept for backward compatibility with
 * downstream consumers that haven't been migrated yet.
 */
export function calculateAmortization(
    accumulatedCost: number,
    startingBalance: number,
    startingAmortization: number,
    amortizationMonths: number,
    launchDate: Date | null,
    asOfDate: Date,
): { monthlyAmortization: number; totalAmortization: number; netBookValue: number; monthsElapsed: number } {
    if (!launchDate) {
        return {
            monthlyAmortization: 0,
            totalAmortization: startingAmortization,
            netBookValue: accumulatedCost + startingBalance - startingAmortization,
            monthsElapsed: 0,
        };
    }

    const totalCost = accumulatedCost + startingBalance;
    const remainingCost = Math.max(0, totalCost - startingAmortization);
    const monthlyAmortization = amortizationMonths > 0 ? remainingCost / amortizationMonths : 0;

    const amortStart = new Date(launchDate.getFullYear(), launchDate.getMonth() + 1, 1);
    const monthsElapsed = Math.max(0,
        (asOfDate.getFullYear() - amortStart.getFullYear()) * 12 +
        (asOfDate.getMonth() - amortStart.getMonth()) + 1
    );

    const capMonths = Math.min(monthsElapsed, amortizationMonths);
    const totalAmortization = startingAmortization + (monthlyAmortization * capMonths);
    const netBookValue = Math.max(0, totalCost - totalAmortization);

    return { monthlyAmortization, totalAmortization, netBookValue, monthsElapsed: capMonths };
}
