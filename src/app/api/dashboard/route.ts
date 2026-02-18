import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateAmortization } from '@/lib/calculations';

export async function GET() {
    try {
        // Get all projects
        const projects = await prisma.project.findMany({
            include: { _count: { select: { tickets: true } } },
        });

        // Get accounting periods for charts (last 12 months sorted)
        const periods = await prisma.accountingPeriod.findMany({
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
            take: 12,
        });

        // Calculate amortization for live projects
        const now = new Date();
        let totalAssetValue = 0;
        let ytdAmortization = 0;

        const projectsWithAmort = projects.map((p) => {
            const amort = calculateAmortization(
                p.accumulatedCost,
                p.startingBalance,
                p.startingAmortization,
                p.amortizationMonths,
                p.launchDate,
                now,
            );
            totalAssetValue += amort.netBookValue;
            if (p.launchDate && p.launchDate.getFullYear() === now.getFullYear()) {
                ytdAmortization += amort.totalAmortization - p.startingAmortization;
            } else if (p.launchDate) {
                // For all live projects, add current year's amortization
                const startOfYear = new Date(now.getFullYear(), 0, 1);
                const monthsThisYear = now.getMonth() + 1;
                ytdAmortization += amort.monthlyAmortization * Math.min(monthsThisYear, amort.monthsElapsed);
            }
            return { ...p, amortization: amort };
        });

        // Active developer count
        const activeDeveloperCount = await prisma.developer.count({ where: { isActive: true } });

        // Top 5 projects by cost
        const topProjects = projectsWithAmort
            .filter((p) => p.isCapitalizable)
            .sort((a, b) => (b.accumulatedCost + b.startingBalance) - (a.accumulatedCost + a.startingBalance))
            .slice(0, 5);

        // Alerts: Live projects needing review
        const alerts = projects
            .filter((p) => p.status === 'LIVE' && !p.overrideReason)
            .map((p) => ({
                id: p.id,
                name: p.name,
                message: `"${p.name}" is Live — verify amortization schedule and review treatment.`,
            }));

        // Chart data
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const chartData = periods.map((p) => ({
            label: `${monthNames[p.month - 1]} ${p.year.toString().slice(2)}`,
            capex: p.totalCapitalized,
            opex: p.totalExpensed,
            amortization: p.totalAmortization,
        }));

        // Running totals for asset value chart
        let runCap = 0;
        let runAmort = 0;
        // Include starting balances from all projects
        for (const proj of projects) {
            runCap += proj.startingBalance;
            runAmort += proj.startingAmortization;
        }
        const assetChartData = periods.map((p) => {
            runCap += p.totalCapitalized;
            runAmort += p.totalAmortization;
            return {
                label: `${monthNames[p.month - 1]} ${p.year.toString().slice(2)}`,
                capitalized: Math.round(runCap * 100) / 100,
                amortized: -Math.round(runAmort * 100) / 100,
                netAsset: Math.round((runCap - runAmort) * 100) / 100,
            };
        });

        return NextResponse.json({
            summary: {
                totalAssetValue,
                ytdAmortization,
                activeDeveloperCount,
                totalProjects: projects.length,
            },
            topProjects: topProjects.map((p) => ({
                id: p.id,
                name: p.name,
                cost: p.accumulatedCost + p.startingBalance,
                status: p.status,
            })),
            chartData,
            assetChartData,
            alerts,
        });
    } catch (error) {
        console.error('Dashboard API error:', error);
        return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
    }
}
