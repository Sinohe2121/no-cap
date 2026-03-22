export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateAmortization } from '@/lib/calculations';

const TODAY = new Date();

export async function GET() {
    try {
        const projects = await prisma.project.findMany({
            where: { isCapitalizable: true },
            include: {
                journalEntries: {
                    where: { entryType: 'CAPITALIZATION' },
                    select: { amount: true },
                },
                _count: { select: { tickets: true } },
            },
            orderBy: { accumulatedCost: 'desc' },
        });

        const assets = projects.map((p) => {
            const costBasis = p.accumulatedCost + p.startingBalance;
            const amort = calculateAmortization(
                p.accumulatedCost,
                p.startingBalance,
                p.startingAmortization,
                p.amortizationMonths,
                p.launchDate,
                TODAY,
            );

            const monthsRemaining = p.launchDate
                ? Math.max(0, p.amortizationMonths - amort.monthsElapsed)
                : null;

            const fullyAmortized = monthsRemaining === 0;

            return {
                id: p.id,
                name: p.name,
                epicKey: p.epicKey,
                status: p.status,
                costBasis,
                accumulatedAmortization: amort.totalAmortization,
                netBookValue: amort.netBookValue,
                monthlyAmortizationRate: amort.monthlyAmortization,
                usefulLifeMonths: p.amortizationMonths,
                monthsElapsed: amort.monthsElapsed,
                monthsRemaining,
                launchDate: p.launchDate,
                startDate: p.startDate,
                mgmtAuthorized: p.mgmtAuthorized,
                probableToComplete: p.probableToComplete,
                fullyAmortized,
                ticketCount: p._count.tickets,
            };
        });

        const totalCostBasis = assets.reduce((s, a) => s + a.costBasis, 0);
        const totalNBV = assets.reduce((s, a) => s + a.netBookValue, 0);
        const totalAccumAmort = assets.reduce((s, a) => s + a.accumulatedAmortization, 0);
        const monthlyAmortBurn = assets.reduce((s, a) => s + a.monthlyAmortizationRate, 0);

        // Add portfolio percentage share
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
