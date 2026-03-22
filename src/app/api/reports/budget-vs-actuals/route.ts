export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { BudgetTargetSchema, formatZodError } from '@/lib/validations';

export async function GET() {
    try {
        const today = new Date();
        const ytdStart = new Date(today.getFullYear(), 0, 1); // Jan 1 of current year

        // Get all periods in current year
        const ytdPeriods = await prisma.accountingPeriod.findMany({
            where: { year: today.getFullYear() },
            include: {
                journalEntries: {
                    where: { entryType: 'CAPITALIZATION' },
                    select: { projectId: true, amount: true },
                },
            },
        });

        // Get all capitalizable projects with budget set
        const projects = await prisma.project.findMany({
            include: {
                journalEntries: {
                    where: {
                        entryType: 'CAPITALIZATION',
                        period: { year: today.getFullYear() },
                    },
                    include: { period: true },
                },
            },
            orderBy: { accumulatedCost: 'desc' },
        });

        const monthsElapsed = today.getMonth() + 1; // 1-indexed months completed this year (current month counts)

        const rows = projects.map((project) => {
            const ytdActual = project.journalEntries.reduce((s, e) => s + e.amount, 0);
            const budgetPerMonth = project.budgetTarget ?? null;
            const ytdBudget = budgetPerMonth !== null ? budgetPerMonth * monthsElapsed : null;

            let variance: number | null = null;
            let variancePct: number | null = null;
            let status: 'COMPLIANT' | 'UNDER' | 'ON_TRACK' | 'OVER' | 'NO_BUDGET' = 'NO_BUDGET';

            if (ytdBudget !== null) {
                variance = ytdActual - ytdBudget;
                variancePct = ytdBudget > 0 ? variance / ytdBudget : 0;

                if (variancePct < -0.1) status = 'UNDER';
                else if (variancePct <= 0.1) status = 'ON_TRACK';
                else status = 'OVER';
            }

            return {
                projectId: project.id,
                projectName: project.name,
                epicKey: project.epicKey,
                projectStatus: project.status,
                budgetPerMonth,
                ytdBudget,
                ytdActual,
                variance,
                variancePct,
                budgetStatus: status,
                monthsElapsed,
                monthlyBreakdown: project.journalEntries.map((e) => ({
                    month: e.period.month,
                    year: e.period.year,
                    actual: e.amount,
                    budget: budgetPerMonth,
                })),
            };
        });

        // YTD totals
        const totalYtdActual = rows.reduce((s, r) => s + r.ytdActual, 0);
        const rowsWithBudget = rows.filter((r) => r.ytdBudget !== null);
        const totalYtdBudget = rowsWithBudget.reduce((s, r) => s + (r.ytdBudget ?? 0), 0);
        const totalVariance = totalYtdActual - totalYtdBudget;
        const overCount = rows.filter((r) => r.budgetStatus === 'OVER').length;
        const underCount = rows.filter((r) => r.budgetStatus === 'UNDER').length;

        return NextResponse.json({
            summary: {
                year: today.getFullYear(),
                monthsElapsed,
                totalYtdActual,
                totalYtdBudget: rowsWithBudget.length > 0 ? totalYtdBudget : null,
                totalVariance: rowsWithBudget.length > 0 ? totalVariance : null,
                projectsOverBudget: overCount,
                projectsUnderBudget: underCount,
                projectsWithNoBudget: rows.filter((r) => r.budgetStatus === 'NO_BUDGET').length,
            },
            rows,
        });
    } catch (error) {
        console.error('Budget vs actuals error:', error);
        return NextResponse.json({ error: 'Failed to generate budget report' }, { status: 500 });
    }
}

// PATCH to set a project's monthly budget target
export async function PATCH(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = BudgetTargetSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { projectId, budgetTarget } = parsed.data;

        const updated = await prisma.project.update({
            where: { id: projectId },
            data: { budgetTarget },
        });

        return NextResponse.json({ id: updated.id, budgetTarget: updated.budgetTarget });
    } catch (error) {
        console.error('Budget target update error:', error);
        return NextResponse.json({ error: 'Failed to update budget target' }, { status: 500 });
    }
}
