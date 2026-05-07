export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ENTRY_TYPES } from '@/lib/constants';
import { calculateAmortization } from '@/lib/calculations';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');
        const now = new Date();
        const periodEnd = endParam ? new Date(endParam + 'T23:59:59') : now;
        const periodStart = startParam
            ? new Date(startParam + 'T00:00:00')
            : new Date(now.getFullYear(), 0, 1);

        // (year, month) → comparable index, where month is 1-12 to match AccountingPeriod
        const toIdx = (year: number, month: number) => year * 12 + (month - 1);
        const endIdx = toIdx(periodEnd.getFullYear(), periodEnd.getMonth() + 1);
        const startIdx = toIdx(periodStart.getFullYear(), periodStart.getMonth() + 1);
        const windowMonths = Math.max(1, endIdx - startIdx + 1);

        const projects = await prisma.project.findMany({
            where: { isCapitalizable: true },
            include: {
                journalEntries: {
                    where: {
                        entryType: { in: [ENTRY_TYPES.CAPITALIZATION, ENTRY_TYPES.AMORTIZATION] },
                    },
                    select: {
                        entryType: true,
                        amount: true,
                        period: { select: { month: true, year: true } },
                    },
                },
                _count: { select: { tickets: true } },
            },
        });

        const assets = projects.map((p) => {
            // Cost basis & accumulated amortization come from posted journal
            // entries (the same source the Roll-Forward and Projects pages use)
            // so the three views can never disagree.
            let postedCapThroughEnd = 0;
            let postedCapInWindow = 0;
            let postedAmortThroughEnd = 0;
            let postedAmortInWindow = 0;

            for (const je of p.journalEntries) {
                if (!je.period) continue;
                const idx = toIdx(je.period.year, je.period.month);
                if (idx > endIdx) continue;
                if (je.entryType === ENTRY_TYPES.CAPITALIZATION) {
                    postedCapThroughEnd += je.amount;
                    if (idx >= startIdx) postedCapInWindow += je.amount;
                } else if (je.entryType === ENTRY_TYPES.AMORTIZATION) {
                    postedAmortThroughEnd += je.amount;
                    if (idx >= startIdx) postedAmortInWindow += je.amount;
                }
            }

            const costBasis = p.startingBalance + postedCapThroughEnd;
            const accumulatedAmortization = p.startingAmortization + postedAmortThroughEnd;
            const netBookValue = Math.max(0, costBasis - accumulatedAmortization);

            // Forward-looking schedule fields (months elapsed/remaining) only
            // make sense when a project-level launchDate is set; ticket-level
            // amort doesn't have a single project-wide schedule.
            const amort = calculateAmortization(
                p.accumulatedCost,
                p.startingBalance,
                p.startingAmortization,
                p.amortizationMonths,
                p.launchDate,
                periodEnd,
            );

            const monthsRemaining = p.launchDate
                ? Math.max(0, p.amortizationMonths - amort.monthsElapsed)
                : null;

            const fullyAmortized = costBasis > 0 && accumulatedAmortization >= costBasis;

            // Per-asset monthly burn averaged over the requested window so the
            // sum across assets equals the summary card.
            const monthlyAmortizationRate = postedAmortInWindow / windowMonths;

            return {
                id: p.id,
                name: p.name,
                epicKey: p.epicKey,
                status: p.status,
                costBasis,
                accumulatedAmortization,
                netBookValue,
                monthlyAmortizationRate,
                usefulLifeMonths: p.amortizationMonths,
                monthsElapsed: amort.monthsElapsed,
                monthsRemaining,
                launchDate: p.launchDate,
                startDate: p.startDate,
                mgmtAuthorized: p.mgmtAuthorized,
                probableToComplete: p.probableToComplete,
                fullyAmortized,
                ticketCount: p._count.tickets,
                capThisPeriod: postedCapInWindow,
            };
        });

        assets.sort((a, b) => b.costBasis - a.costBasis);

        const totalCostBasis = assets.reduce((s, a) => s + a.costBasis, 0);
        const totalNBV = assets.reduce((s, a) => s + a.netBookValue, 0);
        const totalAccumAmort = assets.reduce((s, a) => s + a.accumulatedAmortization, 0);
        const monthlyAmortBurn = assets.reduce((s, a) => s + a.monthlyAmortizationRate, 0);

        const assetsWithShare = assets.map((a) => ({
            ...a,
            portfolioShare: totalCostBasis > 0 ? a.costBasis / totalCostBasis : 0,
        }));

        return NextResponse.json({
            summary: {
                totalAssets: assets.length,
                totalCostBasis,
                totalNBV,
                totalAccumAmort,
                monthlyAmortBurn,
                averageUsefulLife: assets.length > 0
                    ? Math.round(assets.reduce((s, a) => s + a.usefulLifeMonths, 0) / assets.length)
                    : 0,
            },
            assets: assetsWithShare,
        });
    } catch (error) {
        console.error('Portfolio error:', error);
        return NextResponse.json({ error: 'Failed to generate portfolio' }, { status: 500 });
    }
}
