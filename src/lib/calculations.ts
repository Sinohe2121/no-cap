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

export async function calculatePeriodCosts(month: number, year: number): Promise<PeriodCostResult[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Get all active developers
    const developers = await prisma.developer.findMany({
        where: { isActive: true },
    });

    // Get global config
    const fringeConfig = await prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } });
    const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;

    const results: PeriodCostResult[] = [];

    for (const dev of developers) {
        // Get all tickets resolved in this period by this developer
        const tickets = await prisma.jiraTicket.findMany({
            where: {
                assigneeId: dev.id,
                resolutionDate: { gte: startDate, lte: endDate },
            },
            include: { project: true },
        });

        if (tickets.length === 0) continue;

        const totalPoints = tickets.reduce((sum, t) => sum + t.storyPoints, 0);
        if (totalPoints === 0) continue;

        // Capitalize: Stories on capitalizable projects in DEV phase
        // Expense: Bugs, Tasks, tickets on non-capitalizable projects, or projects in PLANNING/LIVE status
        const projectMap: Record<string, { projectId: string; projectName: string; points: number; isCapitalizable: boolean }> = {};

        let capPoints = 0;
        let expPoints = 0;

        for (const ticket of tickets) {
            const isCapitalizableTicket =
                ticket.issueType === 'STORY' &&
                ticket.project.isCapitalizable &&
                ticket.project.status === 'DEV';

            if (isCapitalizableTicket) {
                capPoints += ticket.storyPoints;
            } else {
                expPoints += ticket.storyPoints;
            }

            const key = ticket.projectId;
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
        const loadedCost = dev.monthlySalary + (dev.monthlySalary * fringeRate) + dev.stockCompAllocation;
        const capitalizedAmount = loadedCost * capRatio;
        const expensedAmount = loadedCost * (1 - capRatio);

        // Break down capitalised amount by project
        const projectBreakdown = Object.values(projectMap).map((p) => ({
            ...p,
            amount: p.isCapitalizable ? (p.points / totalPoints) * loadedCost : 0,
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

export function calculateAmortization(
    accumulatedCost: number,
    startingBalance: number,
    startingAmortization: number,
    amortizationMonths: number,
    launchDate: Date | null,
    asOfDate: Date,
): { monthlyAmortization: number; totalAmortization: number; netBookValue: number; monthsElapsed: number } {
    if (!launchDate) {
        return { monthlyAmortization: 0, totalAmortization: startingAmortization, netBookValue: accumulatedCost + startingBalance, monthsElapsed: 0 };
    }

    const totalCost = accumulatedCost + startingBalance;
    const monthlyAmortization = totalCost / amortizationMonths;

    // Months elapsed since month after launch
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
