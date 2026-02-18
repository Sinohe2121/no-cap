import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateAmortization } from '@/lib/calculations';

/**
 * GET /api/reports/asset-value
 * Returns per-project breakdown of net book value
 */
async function getAssetValueReport() {
    const projects = await prisma.project.findMany({
        where: { isCapitalizable: true },
        orderBy: { name: 'asc' },
    });

    const now = new Date();
    const rows = projects.map((p) => {
        const amort = calculateAmortization(
            p.accumulatedCost, p.startingBalance, p.startingAmortization,
            p.amortizationMonths, p.launchDate, now,
        );
        return {
            id: p.id,
            name: p.name,
            status: p.status,
            totalCost: p.accumulatedCost + p.startingBalance,
            accumulatedAmortization: amort.totalAmortization,
            netBookValue: amort.netBookValue,
            launchDate: p.launchDate,
        };
    });

    const total = rows.reduce((sum, r) => sum + r.netBookValue, 0);

    return { title: 'Total Asset Value', subtitle: 'Net book value breakdown by project', rows, total };
}

/**
 * GET /api/reports/ytd-amortization
 * Returns per-project breakdown of current-year amortization
 */
async function getYTDAmortizationReport() {
    const projects = await prisma.project.findMany({
        where: { isCapitalizable: true, launchDate: { not: null } },
        orderBy: { name: 'asc' },
    });

    const now = new Date();
    const currentYear = now.getFullYear();

    const rows = projects.map((p) => {
        const amort = calculateAmortization(
            p.accumulatedCost, p.startingBalance, p.startingAmortization,
            p.amortizationMonths, p.launchDate, now,
        );

        // Calculate YTD — amortization from Jan 1 of current year to now
        let ytdAmount = 0;
        if (p.launchDate) {
            const launchYear = p.launchDate.getFullYear();
            if (launchYear === currentYear) {
                // Launched this year — all amortization so far is YTD
                ytdAmount = amort.totalAmortization - p.startingAmortization;
            } else if (launchYear < currentYear) {
                // Launched prior year — up to 12 months of amortization in current year
                const monthsThisYear = now.getMonth() + 1;
                ytdAmount = amort.monthlyAmortization * Math.min(monthsThisYear, amort.monthsElapsed);
            }
        }

        return {
            id: p.id,
            name: p.name,
            status: p.status,
            totalCost: p.accumulatedCost + p.startingBalance,
            monthlyAmortization: amort.monthlyAmortization,
            ytdAmount: Math.max(0, ytdAmount),
            launchDate: p.launchDate,
        };
    });

    const total = rows.reduce((sum, r) => sum + r.ytdAmount, 0);

    return { title: 'YTD Amortization', subtitle: 'Year-to-date amortization expense by project', rows, total };
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;

        if (slug === 'asset-value') {
            return NextResponse.json(await getAssetValueReport());
        } else if (slug === 'ytd-amortization') {
            return NextResponse.json(await getYTDAmortizationReport());
        }

        return NextResponse.json({ error: 'Unknown report' }, { status: 404 });
    } catch (error) {
        console.error('Report API error:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
