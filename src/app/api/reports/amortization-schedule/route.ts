export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface ScheduleRow {
    month: number;
    year: number;
    label: string;
    amortizationExpense: number;
    accumulatedAmortization: number;
    netBookValue: number;
    isProjected: boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Fix #25 — corrected formula: monthly charge based on REMAINING net cost
// (totalCost - startingAmortization), not the full original cost.
// This matches lib/calculations.ts calculateAmortization and the UI's buildAmortSchedule.
function buildSchedule(project: {
    id: string;
    name: string;
    epicKey: string;
    accumulatedCost: number;
    startingBalance: number;
    startingAmortization: number;
    amortizationMonths: number;
    launchDate: Date | null;
}): ScheduleRow[] {
    if (!project.launchDate || project.amortizationMonths <= 0) return [];

    const totalCost = project.accumulatedCost + project.startingBalance;
    // Remaining depreciable base — don't re-amort what's already been taken
    const remainingCost = Math.max(0, totalCost - project.startingAmortization);
    const monthlyAmort = remainingCost / project.amortizationMonths;
    const today = new Date();

    // Amortization starts the month AFTER launch
    const amortStart = new Date(project.launchDate.getFullYear(), project.launchDate.getMonth() + 1, 1);
    const rows: ScheduleRow[] = [];
    let accumulated = project.startingAmortization;

    for (let i = 0; i < project.amortizationMonths; i++) {
        const date = new Date(amortStart.getFullYear(), amortStart.getMonth() + i, 1);
        accumulated += monthlyAmort;
        const nbv = Math.max(0, totalCost - accumulated);
        const isPast = date <= today;

        rows.push({
            month: date.getMonth() + 1,
            year: date.getFullYear(),
            label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
            amortizationExpense: monthlyAmort,
            accumulatedAmortization: accumulated,
            netBookValue: nbv,
            isProjected: !isPast,
        });
    }
    return rows;
}


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');

        const where = {
            isCapitalizable: true,
            launchDate: { not: null },
            ...(projectId ? { id: projectId } : {}),
        };

        const projects = await prisma.project.findMany({
            where,
            select: {
                id: true,
                name: true,
                epicKey: true,
                accumulatedCost: true,
                startingBalance: true,
                startingAmortization: true,
                amortizationMonths: true,
                launchDate: true,
                status: true,
                amortOverrides: { select: { month: true, year: true, charge: true } },
            },
            orderBy: { launchDate: 'asc' },
        });

        const schedules = projects.map((project) => {
            // Build override lookup
            const overrideMap = new Map<string, number>();
            for (const ov of project.amortOverrides) {
                overrideMap.set(`${ov.year}-${ov.month}`, ov.charge);
            }

            const rows = buildSchedule(project);
            // Merge overrides into rows and recompute running totals
            if (overrideMap.size > 0) {
                const totalCost = project.accumulatedCost + project.startingBalance;
                let accumulated = project.startingAmortization;
                for (const row of rows) {
                    const key = `${row.year}-${row.month}`;
                    if (overrideMap.has(key)) {
                        row.amortizationExpense = overrideMap.get(key)!;
                    }
                    accumulated += row.amortizationExpense;
                    row.accumulatedAmortization = accumulated;
                    row.netBookValue = Math.max(0, totalCost - accumulated);
                }
            }

            return {
                projectId: project.id,
                projectName: project.name,
                epicKey: project.epicKey,
                status: project.status,
                costBasis: project.accumulatedCost + project.startingBalance,
                usefulLifeMonths: project.amortizationMonths,
                launchDate: project.launchDate,
                monthlyRate: (project.accumulatedCost + project.startingBalance) / project.amortizationMonths,
                hasOverrides: overrideMap.size > 0,
                rows,
            };
        });

        return NextResponse.json({ schedules });
    } catch (error) {
        console.error('Amortization schedule error:', error);
        return NextResponse.json({ error: 'Failed to generate schedule' }, { status: 500 });
    }
}
