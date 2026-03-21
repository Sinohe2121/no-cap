import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ENTRY_TYPES } from '@/lib/constants';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');
        const now = new Date();
        const periodEnd = endParam ? new Date(endParam + 'T23:59:59') : now;
        const periodStart = startParam ? new Date(startParam + 'T00:00:00') : new Date(now.getFullYear(), 0, 1);

        // ── Load all projects ──
        const projects = await prisma.project.findMany({
            select: {
                id: true,
                name: true,
                status: true,
                isCapitalizable: true,
                startingBalance: true,
                startingAmortization: true,
                amortizationMonths: true,
                launchDate: true,
            },
        });

        // ── Load all journal entries, split into before-period and in-period ──
        const allEntries = await prisma.journalEntry.findMany({
            include: {
                period: { select: { month: true, year: true } },
            },
        });

        // Build per-project roll-forward
        const rollForward = projects.map(proj => {
            const projEntries = allEntries.filter(e => e.projectId === proj.id);

            // Entries before the selected period start
            const priorEntries = projEntries.filter(e => {
                const entryDate = new Date(e.period.year, e.period.month - 1, 1);
                return entryDate < periodStart;
            });

            // Entries within the selected period
            const periodEntries = projEntries.filter(e => {
                const entryDate = new Date(e.period.year, e.period.month - 1, 1);
                return entryDate >= periodStart && entryDate <= periodEnd;
            });

            // Prior accumulated capitalization
            const priorCapitalized = priorEntries
                .filter(e => e.entryType === ENTRY_TYPES.CAPITALIZATION)
                .reduce((s, e) => s + e.amount, 0);

            // Prior accumulated amortization
            const priorAmortized = priorEntries
                .filter(e => e.entryType === ENTRY_TYPES.AMORTIZATION)
                .reduce((s, e) => s + e.amount, 0);

            // Beginning balances (including any legacy starting balances)
            const beginningGross = proj.startingBalance + priorCapitalized;
            const beginningAccumAmort = proj.startingAmortization + priorAmortized;
            const beginningNBV = beginningGross - beginningAccumAmort;

            // Period activity
            const periodCapitalized = periodEntries
                .filter(e => e.entryType === ENTRY_TYPES.CAPITALIZATION)
                .reduce((s, e) => s + e.amount, 0);

            const periodAmortized = periodEntries
                .filter(e => e.entryType === ENTRY_TYPES.AMORTIZATION)
                .reduce((s, e) => s + e.amount, 0);

            // Ending balances
            const endingGross = beginningGross + periodCapitalized;
            const endingAccumAmort = beginningAccumAmort + periodAmortized;
            const endingNBV = endingGross - endingAccumAmort;

            return {
                project: {
                    id: proj.id,
                    name: proj.name,
                    status: proj.status,
                    isCapitalizable: proj.isCapitalizable,
                    amortizationMonths: proj.amortizationMonths,
                    launchDate: proj.launchDate,
                },
                beginningGross,
                beginningAccumAmort,
                beginningNBV,
                periodCapitalized,
                periodAmortized,
                endingGross,
                endingAccumAmort,
                endingNBV,
            };
        });

        // Filter to only projects that have any activity or balance
        const activeRollForward = rollForward.filter(
            r => r.beginningGross > 0 || r.periodCapitalized > 0 || r.endingGross > 0
        );

        // Totals
        const totals = activeRollForward.reduce(
            (acc, r) => ({
                beginningGross: acc.beginningGross + r.beginningGross,
                beginningAccumAmort: acc.beginningAccumAmort + r.beginningAccumAmort,
                beginningNBV: acc.beginningNBV + r.beginningNBV,
                periodCapitalized: acc.periodCapitalized + r.periodCapitalized,
                periodAmortized: acc.periodAmortized + r.periodAmortized,
                endingGross: acc.endingGross + r.endingGross,
                endingAccumAmort: acc.endingAccumAmort + r.endingAccumAmort,
                endingNBV: acc.endingNBV + r.endingNBV,
            }),
            { beginningGross: 0, beginningAccumAmort: 0, beginningNBV: 0, periodCapitalized: 0, periodAmortized: 0, endingGross: 0, endingAccumAmort: 0, endingNBV: 0 }
        );

        return NextResponse.json({
            projects: activeRollForward,
            totals,
            periodLabel: `${periodStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${periodEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
            periodStart: periodStart.toISOString().slice(0, 10),
            periodEnd: periodEnd.toISOString().slice(0, 10),
        });
    } catch (error) {
        console.error('Roll-forward error:', error);
        return NextResponse.json({ error: 'Failed to generate roll-forward schedule' }, { status: 500 });
    }
}
