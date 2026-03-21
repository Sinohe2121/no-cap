import prisma from '@/lib/prisma';

export interface PeriodCostResult {
    developerId: string;
    developerName: string;
    totalPoints: number;
    capPoints: number;
    expPoints: number;
    capRatio: number;
    loadedCost: number;
    capitalizedAmount: number;
    expensedAmount: number;
    projectBreakdown: {
        projectId: string;
        projectName: string;
        points: number;
        amount: number;
        isCapitalizable: boolean;
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

    const [fringeConfig, standardConfig] = await Promise.all([
        prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
        prisma.globalConfig.findUnique({ where: { key: 'ACCOUNTING_STANDARD' } }),
    ]);
    const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;
    const accountingStandard = standardConfig?.value || 'ASC_350_40';

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
        const tickets = ticketsByDev.get(dev.id) ?? [];
        if (tickets.length === 0) continue;

        const totalPoints = tickets.reduce((sum, t) => sum + t.storyPoints, 0);
        if (totalPoints === 0) continue;

        const projectMap: Record<string, { projectId: string; projectName: string; points: number; isCapitalizable: boolean }> = {};

        let capPoints = 0;
        let expPoints = 0;

        for (const ticket of tickets) {
            if (!ticket.project || !ticket.projectId) continue;

            const proj = ticket.project;

            // ── Capitalization rule based on active accounting standard ────────
            let isCapitalizableTicket = false;

            if (accountingStandard === 'ASU_2025_06') {
                isCapitalizableTicket =
                    ticket.issueType === 'STORY' &&
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
                // The isCapitalizable flag is the explicit user-set gate for capitalization.
                // Project status (DEV/LIVE) is informational — users should toggle
                // isCapitalizable off when a project leaves the development stage.
                isCapitalizableTicket =
                    ticket.issueType === 'STORY' &&
                    ticket.project.isCapitalizable;
            }

            if (isCapitalizableTicket) {
                capPoints += ticket.storyPoints;
            } else {
                expPoints += ticket.storyPoints;
            }

            // Use composite key so the same project gets TWO breakdown entries:
            // one for its capitalizable tickets (STORY) and one for its expensable tickets
            const key = `${ticket.projectId}::${isCapitalizableTicket ? 'cap' : 'exp'}`;
            if (!projectMap[key]) {
                projectMap[key] = {
                    projectId: ticket.projectId,
                    projectName: ticket.project.name,
                    points: 0,
                    isCapitalizable: isCapitalizableTicket,
                };
            }
            projectMap[key].points += ticket.storyPoints;
        }

        const capRatio = totalPoints > 0 ? capPoints / totalPoints : 0;
        const fringeRate = dev.fringeBenefitRate || globalFringeRate;
        const salary = payrollSalaryByDev[dev.id] ?? dev.monthlySalary;
        const loadedCost = salary + (salary * fringeRate) + dev.stockCompAllocation;
        const capitalizedAmount = loadedCost * capRatio;
        const expensedAmount = loadedCost * (1 - capRatio);

        const projectBreakdown = Object.values(projectMap).map((p) => ({
            ...p,
            amount: (p.points / totalPoints) * loadedCost,
        }));

        results.push({
            developerId: dev.id,
            developerName: dev.name,
            totalPoints,
            capPoints,
            expPoints,
            capRatio,
            loadedCost,
            capitalizedAmount,
            expensedAmount,
            projectBreakdown,
        });
    }

    return results;
}

/**
 * Calculate amortization for a SINGLE TICKET.
 *
 * Amortization starts the month AFTER the ticket's resolutionDate.
 * Monthly charge = capitalizedAmount / amortizationMonths (straight-line).
 * Continues until net book value reaches $0.
 */
export function calculateTicketAmortization(
    capitalizedAmount: number,
    amortizationMonths: number,
    resolutionDate: Date,
    asOfDate: Date,
): { monthlyAmortization: number; totalAmortization: number; nbv: number; monthsElapsed: number } {
    if (capitalizedAmount <= 0 || amortizationMonths <= 0) {
        return { monthlyAmortization: 0, totalAmortization: 0, nbv: 0, monthsElapsed: 0 };
    }

    // Amortization starts the first of the month AFTER resolution
    const amortStart = new Date(resolutionDate.getFullYear(), resolutionDate.getMonth() + 1, 1);

    // If we haven't reached the amort start date yet, no amortization
    if (asOfDate < amortStart) {
        return { monthlyAmortization: 0, totalAmortization: 0, nbv: capitalizedAmount, monthsElapsed: 0 };
    }

    const monthlyAmortization = capitalizedAmount / amortizationMonths;

    // Months elapsed since amortization started (inclusive of asOfDate's month)
    const monthsElapsed = Math.max(0,
        (asOfDate.getFullYear() - amortStart.getFullYear()) * 12 +
        (asOfDate.getMonth() - amortStart.getMonth()) + 1
    );

    const cappedMonths = Math.min(monthsElapsed, amortizationMonths);
    const totalAmortization = monthlyAmortization * cappedMonths;
    const nbv = Math.max(0, capitalizedAmount - totalAmortization);

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
