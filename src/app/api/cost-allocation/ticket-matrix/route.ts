export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isTicketActiveInPeriod } from '@/lib/periodTickets';

export async function GET() {
    try {
        // 1. Load system configs
        const [fringeConfig, bugSpConfig, otherSpConfig] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
            prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
            prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
        ]);
        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;
        const bugSpFallback = parseFloat(bugSpConfig?.value ?? '1') || 1;
        const otherSpFallback = parseFloat(otherSpConfig?.value ?? '1') || 1;

        // Applied SP: use Jira value if > 0, else use the configured fallback
        const appliedSP = (t: { storyPoints: number; issueType: string }): number =>
            t.storyPoints > 0 ? t.storyPoints
                : t.issueType === 'BUG' ? bugSpFallback : otherSpFallback;

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

        // 3. Load all tickets with assignee + project (include 0-SP tickets — they use fallback Applied SP)
        const allTickets = await prisma.jiraTicket.findMany({
            where: { assigneeId: { not: null } },
            include: {
                assignee: { select: { id: true, name: true } },
                project: { select: { id: true, name: true, isCapitalizable: true } },
            },
        });

        // 4. Build per-period data
        const periods = payrollImports.map((imp) => {
            // Active developers in this period
            const devEntries = imp.entries;
            const meetingRate: number = (imp as any).meetingTimeRate ?? 0;

            const developers = devEntries.map((entry) => {
                const dev = entry.developer;
                // Use LOCKED rates from this payroll period — must match the payroll register exactly
                const fringeRate: number = (imp as any).fringeBenefitRate ?? globalFringeRate;
                const salary = entry.grossSalary;
                const fringe = salary * fringeRate;
                const sbc: number = (entry as any).sbcAmount ?? 0; // actual SBC from the imported CSV
                const loadedCost = salary + fringe + sbc;
                const netCost = loadedCost * (1 - meetingRate);
                return {
                    id: dev.id,
                    name: dev.name,
                    salary,
                    fringe,
                    sbc,
                    loadedCost,
                    netCost,
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

            // Find tickets active in this period: imported on or before the
            // period AND not resolved before it started. Includes brand-new
            // tickets first imported here AND carry-forwards from earlier
            // periods that are still open or just closed during this one.
            const periodLabel = imp.label;
            const periodTickets = allTickets.filter((t) => isTicketActiveInPeriod(t, periodLabel));

            // Build developer lookup & compute total Applied SP per developer
            const devMap = new Map(developers.map((d) => [d.id, d]));
            const devTotalAppliedSP: Record<string, number> = {};
            for (const t of periodTickets) {
                if (t.assigneeId && devMap.has(t.assigneeId)) {
                    devTotalAppliedSP[t.assigneeId] = (devTotalAppliedSP[t.assigneeId] || 0) + appliedSP(t);
                }
            }

            // Build ticket rows with allocations
            const tickets = periodTickets.map((t) => {
                const allocations: Record<string, { pct: number; amount: number }> = {};

                if (t.assigneeId && devMap.has(t.assigneeId)) {
                    const totalASP = devTotalAppliedSP[t.assigneeId] || 0;
                    const dev = devMap.get(t.assigneeId)!;
                    const tASP = appliedSP(t);
                    const pct = totalASP > 0 ? Math.min(tASP / totalASP, 1) : 0;
                    const amount = dev.netCost * pct;
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
                    appliedSP: appliedSP(t),
                    resolutionDate: t.resolutionDate,
                    importPeriod: t.importPeriod,
                    // True iff this ticket was first seen in an earlier period
                    // and is appearing here as a carry-forward.
                    isCarryForward: !!t.importPeriod && t.importPeriod !== periodLabel,
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
