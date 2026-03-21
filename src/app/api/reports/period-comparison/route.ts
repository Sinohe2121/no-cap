import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Computes summary KPIs for a given date range.
 * Expects ?periodAStart=YYYY-MM-DD&periodAEnd=YYYY-MM-DD&periodBStart=YYYY-MM-DD&periodBEnd=YYYY-MM-DD
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const aStart = searchParams.get('periodAStart');
        const aEnd = searchParams.get('periodAEnd');
        const bStart = searchParams.get('periodBStart');
        const bEnd = searchParams.get('periodBEnd');

        if (!aStart || !aEnd || !bStart || !bEnd) {
            return NextResponse.json({ error: 'All 4 period params required' }, { status: 400 });
        }

        const computePeriod = async (startStr: string, endStr: string) => {
            const start = new Date(startStr + 'T00:00:00');
            const end = new Date(endStr + 'T23:59:59');

            const tickets = await prisma.jiraTicket.findMany({
                where: { createdAt: { gte: start, lte: end } },
                include: { project: { select: { isCapitalizable: true } } },
            });

            const developers = await prisma.developer.findMany({
                where: { isActive: true },
            });

            const journalEntries = await prisma.journalEntry.findMany({
                where: {
                    period: {
                        year: { gte: start.getFullYear(), lte: end.getFullYear() },
                    },
                },
            });

            const totalTickets = tickets.length;
            const totalSP = tickets.reduce((s, t) => s + (t.storyPoints || 0), 0);
            const bugTickets = tickets.filter(t => t.issueType === 'Bug' || t.issueType === 'BUG');
            const bugSP = bugTickets.reduce((s, t) => s + (t.storyPoints || 0), 0);
            const featureSP = tickets
                .filter(t => t.issueType === 'Story' || t.issueType === 'STORY')
                .reduce((s, t) => s + (t.storyPoints || 0), 0);

            const capTickets = tickets.filter(t => t.project?.isCapitalizable);
            const capSP = capTickets.reduce((s, t) => s + (t.storyPoints || 0), 0);
            const capRatio = totalSP > 0 ? Math.round((capSP / totalSP) * 100) : 0;
            const bugRatio = totalSP > 0 ? Math.round((bugSP / totalSP) * 100) : 0;

            const resolvedTickets = tickets.filter(t => t.resolutionDate);
            const cycleTimes = resolvedTickets.map(t => {
                const created = new Date(t.createdAt).getTime();
                const resolved = new Date(t.resolutionDate!).getTime();
                return (resolved - created) / (1000 * 60 * 60 * 24);
            }).filter(d => d >= 0);

            const avgCycleTime = cycleTimes.length > 0
                ? Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 10) / 10
                : 0;

            // Financial
            let totalCapitalized = 0;
            let totalExpensed = 0;
            let totalAmortized = 0;
            for (const je of journalEntries) {
                if (je.entryType === 'CAPITALIZATION') totalCapitalized += je.amount;
                else if (je.entryType === 'EXPENSE') totalExpensed += je.amount;
                else if (je.entryType === 'AMORTIZATION') totalAmortized += je.amount;
            }

            const activeDevs = developers.length;

            // Cost per ticket
            const totalAllocated = tickets.reduce((s, t) => s + ((t as any).allocatedCost || 0), 0);
            const costPerTicket = totalTickets > 0 ? Math.round(totalAllocated / totalTickets) : 0;
            const costPerSP = totalSP > 0 ? Math.round(totalAllocated / totalSP) : 0;

            return {
                totalTickets,
                totalSP,
                featureSP,
                bugSP,
                capRatio,
                bugRatio,
                avgCycleTime,
                activeDevs,
                totalCapitalized: Math.round(totalCapitalized),
                totalExpensed: Math.round(totalExpensed),
                totalAmortized: Math.round(totalAmortized),
                costPerTicket,
                costPerSP,
                totalAllocated: Math.round(totalAllocated),
            };
        }

        const [periodA, periodB] = await Promise.all([
            computePeriod(aStart, aEnd),
            computePeriod(bStart, bEnd),
        ]);

        return NextResponse.json({ periodA, periodB });
    } catch (error) {
        console.error('Period comparison error:', error);
        return NextResponse.json({ error: 'Failed to compute period comparison' }, { status: 500 });
    }
}
