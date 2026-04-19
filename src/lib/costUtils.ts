import prisma from '@/lib/prisma';

/**
 * Shared cost computation — single source of truth for loaded cost calculation.
 * Used by: journal entry generation, cost-allocation, dashboard, projects,
 * cost-by-type, ticket-matrix, jira preview, payroll-register.
 *
 * loadedCost = salary + (salary × fringeRate) + stockCompAllocation
 */
export function computeLoadedCost(
    salary: number,
    fringeRate: number,
    stockCompAllocation: number
): number {
    return salary + (salary * fringeRate) + stockCompAllocation;
}

/**
 * Fetch payroll-derived salary for a given developer in a given month.
 * Falls back to developer.monthlySalary if no PayrollImport exists.
 */
export async function fetchPayrollSalaries(
    month: number,
    year: number
): Promise<Record<string, number>> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const payrollImports = await prisma.payrollImport.findMany({
        where: { payDate: { gte: startDate, lte: endDate } },
        include: { entries: { select: { developerId: true, grossSalary: true } } },
    });

    const salaryByDev: Record<string, number> = {};
    for (const imp of payrollImports) {
        for (const entry of imp.entries) {
            salaryByDev[entry.developerId] =
                (salaryByDev[entry.developerId] || 0) + entry.grossSalary;
        }
    }
    return salaryByDev;
}

/**
 * Build an allocation map: for each developer, compute their loaded cost
 * and distribution across projects by story-point ratio.
 *
 * This is the core pattern used by cost-allocation, dashboard, projects,
 * cost-by-type, and ticket-matrix endpoints.
 */
export interface CostDistribution {
    projectId: string;
    projectName: string;
    ratio: number;
    cost: number;
}

export interface DeveloperCostAllocation {
    developerId: string;
    developerName: string;
    salary: number;
    fringe: number;
    sbc: number;
    totalCost: number;
    distributions: CostDistribution[];
}

export async function buildCostAllocations(
    month: number,
    year: number,
    globalFringeRate: number
): Promise<DeveloperCostAllocation[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Fetch meeting rate and SP fallbacks alongside developer data
    const [meetingConfig, bugSpConfig, otherSpConfig, developers] = await Promise.all([
        prisma.globalConfig.findUnique({ where: { key: 'MEETING_TIME_RATE' } }),
        prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
        prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
        prisma.developer.findMany({
            where: { isActive: true },
            include: {
                payrollEntries: {
                    where: {
                        payrollImport: { payDate: { gte: startDate, lte: endDate } },
                    },
                    include: {
                        payrollImport: { select: { fringeBenefitRate: true, payDate: true } },
                    },
                },
            },
        }),
    ]);

    const globalMeetingRate = meetingConfig ? parseFloat(meetingConfig.value) : 0;
    const bugSpFallback = parseFloat(bugSpConfig?.value ?? '1') || 1;
    const otherSpFallback = parseFloat(otherSpConfig?.value ?? '1') || 1;

    /** Applied SP: Jira value if > 0, otherwise type-appropriate fallback */
    const appliedSP = (t: { storyPoints: number; issueType: string }) =>
        t.storyPoints > 0 ? t.storyPoints : t.issueType === 'BUG' ? bugSpFallback : otherSpFallback;

    // "Open during period" = still open OR resolved within this month
    const tickets = await prisma.jiraTicket.findMany({
        where: {
            assigneeId: { in: developers.map((d) => d.id) },
            OR: [
                { resolutionDate: null },
                { resolutionDate: { gte: startDate, lte: endDate } },
            ],
        },
        include: { project: { select: { id: true, name: true } } },
    });

    // Group tickets by developer
    const ticketsByDev = new Map<string, typeof tickets>();
    for (const t of tickets) {
        if (!t.assigneeId) continue;
        const arr = ticketsByDev.get(t.assigneeId) ?? [];
        arr.push(t);
        ticketsByDev.set(t.assigneeId, arr);
    }

    const allocations: DeveloperCostAllocation[] = [];

    for (const dev of developers) {
        const devTickets = ticketsByDev.get(dev.id) ?? [];
        const totalPoints = devTickets.reduce((s, t) => s + appliedSP(t), 0);
        if (totalPoints === 0) continue;

        // Compute salary from payroll entries
        const salary = dev.payrollEntries.reduce((s, pe) => s + pe.grossSalary, 0) || dev.monthlySalary;
        const fringe = dev.payrollEntries.length > 0
            ? dev.payrollEntries.reduce((s, pe) => s + (pe.grossSalary * (pe.payrollImport.fringeBenefitRate ?? 0)), 0)
            : salary * (dev.fringeBenefitRate || globalFringeRate);
        const sbc = dev.stockCompAllocation;
        // fringe is already a dollar amount (not a rate), so loaded cost = salary + fringe + sbc
        const loadedCost = salary + fringe + sbc;
        // Apply meeting rate to match journal entry calculation
        const totalCost = loadedCost * (1 - globalMeetingRate);

        // Group points by project using Applied SP
        const projectPoints: Record<string, { name: string; points: number }> = {};
        for (const t of devTickets) {
            if (!t.project) continue;
            if (!projectPoints[t.project.id]) {
                projectPoints[t.project.id] = { name: t.project.name, points: 0 };
            }
            projectPoints[t.project.id].points += appliedSP(t);
        }

        const distributions: CostDistribution[] = Object.entries(projectPoints).map(
            ([projectId, { name, points }]) => ({
                projectId,
                projectName: name,
                ratio: points / totalPoints,
                cost: (points / totalPoints) * totalCost,
            })
        );

        allocations.push({
            developerId: dev.id,
            developerName: dev.name,
            salary,
            fringe,
            sbc,
            totalCost,
            distributions,
        });
    }

    return allocations;
}

