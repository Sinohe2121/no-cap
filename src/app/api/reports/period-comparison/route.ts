export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/** Rich period-comparison data used by the Flux Analysis page and LLM prompt. */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const aStart = searchParams.get('periodAStart');
        const aEnd   = searchParams.get('periodAEnd');
        const bStart = searchParams.get('periodBStart');
        const bEnd   = searchParams.get('periodBEnd');

        if (!aStart || !aEnd || !bStart || !bEnd) {
            return NextResponse.json({ error: 'All 4 period params required' }, { status: 400 });
        }

        const computePeriod = async (startStr: string, endStr: string) => {
            const start = new Date(startStr + 'T00:00:00');
            const end   = new Date(endStr   + 'T23:59:59');
            const year  = start.getFullYear();
            const month = start.getMonth() + 1;

            // Generate all importPeriod labels covering this range (e.g. ["January 2026", "February 2026"])
            const importPeriodLabels: string[] = [];
            const cursor = new Date(year, month - 1, 1);
            const endMonth = new Date(endStr + 'T00:00:00');
            while (cursor <= endMonth) {
                importPeriodLabels.push(
                    cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                );
                cursor.setMonth(cursor.getMonth() + 1);
            }

            // Fetch tickets for all months in the range
            const tickets = await db.jiraTicket.findMany({
                where: { importPeriod: { in: importPeriodLabels } },
                include: {
                    project: { select: { id: true, name: true, isCapitalizable: true, status: true } },
                    assignee: { select: { id: true, name: true } },
                    auditTrails: { select: { allocatedAmount: true } },
                },
            });

            const totalTickets = tickets.length;
            const totalSP  = tickets.reduce((s: number, t: any) => s + (t.storyPoints || 0), 0);
            const bugTickets  = tickets.filter((t: any) => ['Bug', 'BUG'].includes(t.issueType));
            const taskTickets = tickets.filter((t: any) => ['Task', 'TASK'].includes(t.issueType));
            const storyTickets= tickets.filter((t: any) => ['Story', 'STORY'].includes(t.issueType));

            const bugSP   = bugTickets.reduce((s: number, t: any) => s + (t.storyPoints || 0), 0);
            const featureSP = storyTickets.reduce((s: number, t: any) => s + (t.storyPoints || 0), 0);

            const bugCost  = bugTickets.reduce((s: number, t: any) =>
                s + t.auditTrails.reduce((ss: number, a: any) => ss + (a.allocatedAmount ?? 0), 0), 0);
            const taskCost = taskTickets.reduce((s: number, t: any) =>
                s + t.auditTrails.reduce((ss: number, a: any) => ss + (a.allocatedAmount ?? 0), 0), 0);

            // Cap ratio
            const capTickets = tickets.filter((t: any) => t.project?.isCapitalizable);
            const capSP = capTickets.reduce((s: number, t: any) => s + (t.storyPoints || 0), 0);
            const capRatio = totalSP > 0 ? Math.round((capSP / totalSP) * 100) : 0;
            const bugRatio = totalSP > 0 ? Math.round((bugSP / totalSP) * 100) : 0;

            // Avg cycle time
            const cycleTimes = tickets
                .filter((t: any) => t.resolutionDate)
                .map((t: any) => {
                    const createdRaw = t.customFields?.Created ?? t.createdAt;
                    const created  = new Date(createdRaw).getTime();
                    const resolved = new Date(t.resolutionDate!).getTime();
                    return (resolved - created) / (1000 * 60 * 60 * 24);
                })
                .filter((d: number) => d >= 0);
            const avgCycleTime = cycleTimes.length
                ? Math.round((cycleTimes.reduce((a: number, b: number) => a + b, 0) / cycleTimes.length) * 10) / 10
                : 0;

            // ── Capitalized by project ─────────────────────────────────────────
            const projectMap: Record<string, { name: string; status: string; capSP: number; totalCost: number }> = {};
            for (const t of tickets as any[]) {
                if (!t.project?.isCapitalizable) continue;
                const pid = t.project.id;
                if (!projectMap[pid]) projectMap[pid] = { name: t.project.name, status: t.project.status, capSP: 0, totalCost: 0 };
                projectMap[pid].capSP += t.storyPoints || 0;
                projectMap[pid].totalCost += t.auditTrails.reduce((s: number, a: any) => s + (a.allocatedAmount ?? 0), 0);
            }
            const projectBreakdown = Object.values(projectMap).sort((a, b) => b.totalCost - a.totalCost);

            // ── Journal entries: aggregate across all accounting periods in range ──
            const monthYearPairs = importPeriodLabels.map(label => {
                const d = new Date(label + ' 1'); // parse "February 2026" as a date
                return { month: d.getMonth() + 1, year: d.getFullYear() };
            });
            const accountingPeriods = await db.accountingPeriod.findMany({
                where: { OR: monthYearPairs.map((p: any) => ({ month: p.month, year: p.year })) },
                select: { id: true },
            });
            let totalCapitalized = 0, totalExpensed = 0, totalAmortized = 0;
            if (accountingPeriods.length > 0) {
                const periodIds = (accountingPeriods as any[]).map((ap: any) => ap.id);
                const journalEntries = await db.journalEntry.findMany({
                    where: { periodId: { in: periodIds } },
                });
                for (const je of journalEntries as any[]) {
                    if (je.entryType === 'CAPITALIZATION') totalCapitalized += je.amount;
                    else if (['EXPENSE', 'EXPENSE_BUG', 'EXPENSE_TASK'].includes(je.entryType)) totalExpensed += je.amount;
                    else if (je.entryType === 'AMORTIZATION') totalAmortized += je.amount;
                }
            }

            // ── Payroll ───────────────────────────────────────────────────────
            // PayrollImport has no 'month' field — filter by payDate within the period
            const payrollImports = await db.payrollImport.findMany({
                where: { payDate: { gte: start, lte: end } },
                include: { entries: { select: { grossSalary: true } } },
            });
            let totalPayroll = 0, headcount = 0;
            for (const pi of payrollImports as any[]) {
                const gross  = pi.entries.reduce((s: number, e: any) => s + e.grossSalary, 0);
                totalPayroll += gross * (1 + pi.fringeBenefitRate);
                headcount     = Math.max(headcount, pi.entries.length);
            }
            const payrollLabel = payrollImports[0]?.label ?? null;

            // ── Developer coverage ────────────────────────────────────────────
            const assigneeIds = new Set(tickets.filter((t: any) => t.assigneeId).map((t: any) => t.assigneeId));
            const activeDevs  = assigneeIds.size;

            // Top devs by ticket count
            const devTicketCounts: Record<string, { name: string; count: number }> = {};
            for (const t of tickets as any[]) {
                if (!t.assigneeId) continue;
                if (!devTicketCounts[t.assigneeId]) devTicketCounts[t.assigneeId] = { name: t.assignee?.name ?? 'Unknown', count: 0 };
                devTicketCounts[t.assigneeId].count++;
            }
            const topDevs = Object.values(devTicketCounts)
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            // ── Amortization new-project callout ──────────────────────────────
            const amortOverrides = await db.amortizationOverride.findMany({
                where: { year, month },
                include: { project: { select: { name: true } } },
            });
            const amortByProject = (amortOverrides as any[]).map((a: any) => ({
                projectName: a.project.name,
                charge: a.charge,
            }));

            const totalAllocated = tickets.reduce((s: number, t: any) =>
                s + t.auditTrails.reduce((ss: number, a: any) => ss + (a.allocatedAmount ?? 0), 0), 0);
            const costPerTicket = totalTickets > 0 ? Math.round(totalAllocated / totalTickets) : 0;
            const costPerSP     = totalSP     > 0 ? Math.round(totalAllocated / totalSP)     : 0;

            return {
                // Summary KPIs
                totalTickets, totalSP, featureSP, bugSP, bugCost,
                taskCost, capRatio, bugRatio, avgCycleTime,
                activeDevs, headcount, totalPayroll: Math.round(totalPayroll),
                payrollLabel,
                totalCapitalized: Math.round(totalCapitalized),
                totalExpensed: Math.round(totalExpensed),
                totalAmortized: Math.round(totalAmortized),
                costPerTicket, costPerSP,
                totalAllocated: Math.round(totalAllocated),
                // Detail
                projectBreakdown,
                topDevs,
                amortByProject,
            };
        };

        const [periodA, periodB] = await Promise.all([
            computePeriod(aStart, aEnd),
            computePeriod(bStart, bEnd),
        ]);

        return NextResponse.json({ periodA, periodB });
    } catch (error) {
        console.error('Flux period-comparison error:', error);
        return NextResponse.json({ error: 'Failed to compute period comparison' }, { status: 500 });
    }
}
