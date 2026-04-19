import prisma from '@/lib/prisma';

/**
 * Compute and persist per-ticket cost allocations to JiraTicket.allocatedAmount.
 *
 * For each developer on the payroll for the given import period:
 *   netCost = (grossSalary + fringe + SBC) × (1 − meetingRate)
 *   ticketCost = netCost × appliedSP(ticket) / devTotalAppliedSP
 *
 * Ticket scope: ALL tickets that were open during the payroll period
 * (still open OR resolved within the period month), not just newly imported ones.
 *
 * Applied SP uses BUG_SP_FALLBACK / OTHER_SP_FALLBACK for tickets with 0 Jira SP.
 *
 * NOTE: This writes a SNAPSHOT estimate of allocatedAmount for the period.
 * Once journal entries are generated via the accounting route, those values
 * take precedence (the JE route increments allocatedAmount via AuditTrail).
 */
export async function persistTicketCosts(importPeriodLabel: string): Promise<{ updated: number }> {
    // ── Load global config ────────────────────────────────────────────────
    const [fringeConfig, meetingConfig, bugSpConfig, otherSpConfig] = await Promise.all([
        prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
        prisma.globalConfig.findUnique({ where: { key: 'MEETING_TIME_RATE' } }),
        prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
        prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
    ]);
    const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;
    const globalMeetingRate = meetingConfig ? parseFloat(meetingConfig.value) : 0;
    const bugSpFallback = parseFloat(bugSpConfig?.value ?? '1') || 1;
    const otherSpFallback = parseFloat(otherSpConfig?.value ?? '1') || 1;

    const appliedSP = (t: { storyPoints: number; issueType: string }): number =>
        t.storyPoints > 0 ? t.storyPoints
            : t.issueType === 'BUG' ? bugSpFallback : otherSpFallback;

    // ── Load payroll import for this period ───────────────────────────────
    const payrollImport = await prisma.payrollImport.findFirst({
        where: { label: importPeriodLabel },
        include: {
            entries: {
                where: { grossSalary: { gt: 1 } },
                select: {
                    developerId: true,
                    grossSalary: true,
                    sbcAmount: true,
                    developer: { select: { id: true, fringeBenefitRate: true, stockCompAllocation: true } },
                },
            },
        },
    });

    if (!payrollImport) return { updated: 0 };

    const periodFringeRate: number = (payrollImport as any).fringeBenefitRate ?? globalFringeRate;
    const meetingRate: number = (payrollImport as any).meetingTimeRate ?? globalMeetingRate;

    // ── Derive period dates from payroll import pay date ─────────────────
    const payDate = new Date(payrollImport.payDate);
    const periodStart = new Date(payDate.getFullYear(), payDate.getMonth(), 1);
    const periodEnd = new Date(payDate.getFullYear(), payDate.getMonth() + 1, 0, 23, 59, 59);

    // ── Load ALL tickets open during this period ───────────────────────
    // "Open during period" = still open (no resolutionDate) OR resolved within this month.
    // This matches the same selection logic as calculatePeriodCosts in calculations.ts.
    const devIds = payrollImport.entries.map(e => e.developerId);
    const tickets = await prisma.jiraTicket.findMany({
        where: {
            assigneeId: { in: devIds },
            OR: [
                { resolutionDate: null },
                { resolutionDate: { gte: periodStart, lte: periodEnd } },
            ],
        },
        select: { id: true, assigneeId: true, storyPoints: true, issueType: true },
    });

    if (tickets.length === 0) return { updated: 0 };

    // Group tickets by developer
    const ticketsByDev = new Map<string, typeof tickets>();
    for (const t of tickets) {
        if (!t.assigneeId) continue;
        const arr = ticketsByDev.get(t.assigneeId) ?? [];
        arr.push(t);
        ticketsByDev.set(t.assigneeId, arr);
    }

    // ── Compute all costs in memory first ────────────────────────────────
    const updateMap = new Map<string, number>(); // ticket DB id -> cost

    for (const entry of payrollImport.entries) {
        const devId = entry.developerId;
        const devTickets = ticketsByDev.get(devId) ?? [];
        if (devTickets.length === 0) continue;

        const salary = entry.grossSalary;
        const devFringeRate = entry.developer?.fringeBenefitRate ?? periodFringeRate;
        const fringe = salary * devFringeRate;
        // SBC: prefer per-entry sbcAmount, fall back to developer's default, then 0
        const sbc = entry.sbcAmount ?? entry.developer?.stockCompAllocation ?? 0;
        const loadedCost = salary + fringe + sbc;
        const netCost = loadedCost * (1 - meetingRate);

        const devTotalAppliedSP = devTickets.reduce((s, t) => s + appliedSP(t), 0);
        if (devTotalAppliedSP === 0) continue;

        for (const t of devTickets) {
            const pct = appliedSP(t) / devTotalAppliedSP;
            const ticketCost = Math.round(netCost * pct * 100) / 100;
            updateMap.set(t.id, ticketCost);
        }
    }

    // ── Write in batches of 50 to stay within connection pool limits ──────
    const allUpdates = Array.from(updateMap.entries());
    const BATCH_SIZE = 50;

    for (let i = 0; i < allUpdates.length; i += BATCH_SIZE) {
        const batch = allUpdates.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(
            batch.map(([id, cost]) =>
                prisma.jiraTicket.update({ where: { id }, data: { allocatedAmount: cost } })
            )
        );
    }

    return { updated: allUpdates.length };

}
