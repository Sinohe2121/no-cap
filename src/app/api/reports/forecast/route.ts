import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function GET() {
    try {
        const today = new Date();

        // Pull last 6 closed/open periods for trailing average
        const periods = await prisma.accountingPeriod.findMany({
            include: {
                journalEntries: {
                    include: { project: true },
                },
            },
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
            take: 6,
        });

        // Compute per-project trailing cap / expense averages
        const projectTotals: Record<string, {
            name: string;
            capTotal: number;
            expTotal: number;
            periodCount: number;
        }> = {};

        for (const period of periods) {
            for (const entry of period.journalEntries) {
                if (!projectTotals[entry.projectId]) {
                    projectTotals[entry.projectId] = {
                        name: entry.project.name,
                        capTotal: 0,
                        expTotal: 0,
                        periodCount: 0,
                    };
                }
                if (entry.entryType === 'CAPITALIZATION') {
                    projectTotals[entry.projectId].capTotal += entry.amount;
                } else if (entry.entryType === 'EXPENSE') {
                    projectTotals[entry.projectId].expTotal += entry.amount;
                }
            }
        }

        // Count unique periods per project
        for (const period of periods) {
            const seenProjects = new Set(period.journalEntries.map((e) => e.projectId));
            for (const pid of Array.from(seenProjects)) {
                if (projectTotals[pid]) {
                    projectTotals[pid].periodCount += 1;
                }
            }
        }

        // Build 6-month forward forecast
        const forecastMonths: { month: number; year: number; label: string; projects: { projectId: string; name: string; cap: number; expense: number }[]; totalCap: number; totalExpense: number; totalRD: number }[] = [];

        for (let i = 1; i <= 6; i++) {
            const forecastDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const month = forecastDate.getMonth() + 1;
            const year = forecastDate.getFullYear();
            const label = `${MONTH_NAMES[month - 1]} ${year}`;

            const projectBreakdown = Object.entries(projectTotals).map(([projectId, data]) => {
                const n = Math.max(data.periodCount, 1);
                return {
                    projectId,
                    name: data.name,
                    cap: data.capTotal / n,
                    expense: data.expTotal / n,
                };
            });

            const totalCap = projectBreakdown.reduce((s, p) => s + p.cap, 0);
            const totalExpense = projectBreakdown.reduce((s, p) => s + p.expense, 0);

            forecastMonths.push({
                month,
                year,
                label,
                projects: projectBreakdown,
                totalCap,
                totalExpense,
                totalRD: totalCap + totalExpense,
            });
        }

        // Also return the trailing actuals for comparison
        const actuals = periods.slice().reverse().map((period) => {
            const cap = period.journalEntries
                .filter((e) => e.entryType === 'CAPITALIZATION')
                .reduce((s, e) => s + e.amount, 0);
            const expense = period.journalEntries
                .filter((e) => e.entryType === 'EXPENSE')
                .reduce((s, e) => s + e.amount, 0);
            return {
                month: period.month,
                year: period.year,
                label: `${MONTH_NAMES[period.month - 1]} ${period.year}`,
                totalCap: cap,
                totalExpense: expense,
                totalRD: cap + expense,
                isActual: true,
            };
        });

        const totalForecastCap = forecastMonths.reduce((s, m) => s + m.totalCap, 0);
        const totalForecastRD = forecastMonths.reduce((s, m) => s + m.totalRD, 0);
        const avgCapRate = totalForecastRD > 0 ? totalForecastCap / totalForecastRD : 0;

        return NextResponse.json({
            summary: {
                forecastPeriods: 6,
                totalForecastCap,
                totalForecastRD,
                avgCapRate,
                basedOnPeriods: periods.length,
            },
            actuals,
            forecast: forecastMonths,
        });
    } catch (error) {
        console.error('Forecast error:', error);
        return NextResponse.json({ error: 'Failed to generate forecast' }, { status: 500 });
    }
}
