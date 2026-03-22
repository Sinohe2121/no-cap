export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeLoadedCost } from '@/lib/costUtils';

export async function GET() {
    try {
        // 1. Load system fringe rate
        const fringeConfig = await prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } });
        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;

        // 2. Load payroll imports with entries + developer info
        const payrollImports = await prisma.payrollImport.findMany({
            orderBy: { payDate: 'desc' }, // newest first
            include: {
                entries: {
                    where: { grossSalary: { gt: 1 } },
                    include: {
                        developer: { select: { id: true, name: true, fringeBenefitRate: true, stockCompAllocation: true } },
                    },
                },
            },
        });

        // 3. Load all tickets with assignee + project
        const allTickets = await prisma.jiraTicket.findMany({
            where: { storyPoints: { gt: 0 } },
            include: {
                assignee: { select: { id: true, name: true } },
                project: { select: { id: true, name: true, isCapitalizable: true } },
            },
        });

        // 4. Build per-period data
        const periods = payrollImports.map((imp) => {
            // Active developers in this period
            const devEntries = imp.entries;
            const developers = devEntries.map((entry) => {
                const dev = entry.developer;
                const fringeRate = dev.fringeBenefitRate || globalFringeRate;
                const salary = entry.grossSalary;
                const fringe = salary * fringeRate;
                const sbc = dev.stockCompAllocation || 0;
                const loadedCost = computeLoadedCost(salary, fringeRate, sbc);
                return {
                    id: dev.id,
                    name: dev.name,
                    salary,
                    fringe,
                    sbc,
                    loadedCost,
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

            // Determine month window from payDate
            const pd = new Date(imp.payDate);
            const monthStart = new Date(pd.getFullYear(), pd.getMonth(), 1);
            const monthEnd = new Date(pd.getFullYear(), pd.getMonth() + 1, 0, 23, 59, 59);

            // Find tickets for this period (by importPeriod match or resolution/creation date)
            const periodLabel = imp.label;
            const periodTickets = allTickets.filter((t) => {
                // First try importPeriod match
                if (t.importPeriod === periodLabel) return true;
                // Fallback: resolution or creation date within month window
                const rd = t.resolutionDate ? new Date(t.resolutionDate) : new Date(t.createdAt);
                return rd >= monthStart && rd <= monthEnd;
            });

            // Build developer lookup & compute total SP per developer
            const devMap = new Map(developers.map((d) => [d.id, d]));
            const devTotalSP: Record<string, number> = {};
            for (const t of periodTickets) {
                if (t.assigneeId && devMap.has(t.assigneeId)) {
                    devTotalSP[t.assigneeId] = (devTotalSP[t.assigneeId] || 0) + t.storyPoints;
                }
            }

            // Build ticket rows with allocations
            const tickets = periodTickets.map((t) => {
                const allocations: Record<string, { pct: number; amount: number }> = {};

                if (t.assigneeId && devMap.has(t.assigneeId)) {
                    const totalSP = devTotalSP[t.assigneeId] || 0;
                    const dev = devMap.get(t.assigneeId)!;
                    const pct = totalSP > 0 ? t.storyPoints / totalSP : 0;
                    const amount = dev.loadedCost * pct;
                    allocations[t.assigneeId] = { pct, amount };
                }

                return {
                    id: t.id,
                    ticketId: t.ticketId,
                    summary: t.summary,
                    projectName: t.project?.name || 'Unlinked',
                    isCapitalizable: t.project?.isCapitalizable ?? false,
                    assigneeName: t.assignee?.name || 'Unassigned',
                    assigneeId: t.assigneeId,
                    storyPoints: t.storyPoints,
                    resolutionDate: t.resolutionDate,
                    allocations,
                };
            });

            // Sort tickets by project then ticketId
            tickets.sort((a, b) => a.projectName.localeCompare(b.projectName) || a.ticketId.localeCompare(b.ticketId));

            // Compute totals per developer
            const devTotals: Record<string, number> = {};
            for (const t of tickets) {
                for (const [devId, alloc] of Object.entries(t.allocations)) {
                    devTotals[devId] = (devTotals[devId] || 0) + alloc.amount;
                }
            }

            const totalAllocated = Object.values(devTotals).reduce((s, v) => s + v, 0);
            const totalLoadedCost = developers.reduce((s, d) => s + d.loadedCost, 0);

            return {
                label: periodLabel,
                payDate: imp.payDate,
                developers,
                tickets,
                devTotals,
                totalAllocated,
                totalLoadedCost,
                unallocated: totalLoadedCost - totalAllocated,
            };
        });

        return NextResponse.json({ periods, globalFringeRate });
    } catch (error) {
        console.error('Ticket matrix error:', error);
        return NextResponse.json({ error: 'Failed to build ticket matrix' }, { status: 500 });
    }
}
