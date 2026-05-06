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

// "Launched" = status DEV or LIVE. Resolution date on each ticket is the
// asset's start date; the project-level launchDate is not the SoT.
const LAUNCHED_STATUSES = ['DEV', 'LIVE'] as const;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');

        const projects = await prisma.project.findMany({
            where: {
                isCapitalizable: true,
                status: { in: [...LAUNCHED_STATUSES] },
                ...(projectId ? { id: projectId } : {}),
            },
            select: {
                id: true,
                name: true,
                epicKey: true,
                status: true,
                launchDate: true,
                accumulatedCost: true,
                startingBalance: true,
                startingAmortization: true,
                amortizationMonths: true,
                amortOverrides: { select: { month: true, year: true, charge: true } },
                tickets: {
                    where: {
                        allocatedAmount: { gt: 0 },
                        resolutionDate: { not: null },
                    },
                    select: {
                        allocatedAmount: true,
                        amortizationMonths: true,
                        resolutionDate: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        const now = new Date();

        const schedules = projects.flatMap((project) => {
            const tickets = project.tickets.filter(
                (t) => t.amortizationMonths > 0 && t.resolutionDate
            );

            // Per-ticket amort: each resolved capitalized ticket starts amortizing
            // the month after its resolutionDate, straight-line over its useful life.
            const monthCharges = new Map<string, number>();
            let costBasis = 0;
            let earliestStart: Date | null = null;
            let latestEnd: Date | null = null;
            let monthlySteadyRate = 0;
            let maxAmortMonths = 0;

            for (const t of tickets) {
                const res = new Date(t.resolutionDate!);
                const start = new Date(res.getFullYear(), res.getMonth() + 1, 1);
                const monthly = t.allocatedAmount / t.amortizationMonths;
                costBasis += t.allocatedAmount;
                monthlySteadyRate += monthly;
                if (t.amortizationMonths > maxAmortMonths) maxAmortMonths = t.amortizationMonths;

                if (!earliestStart || start < earliestStart) earliestStart = start;

                for (let i = 0; i < t.amortizationMonths; i++) {
                    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
                    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                    monthCharges.set(key, (monthCharges.get(key) || 0) + monthly);
                    if (!latestEnd || d > latestEnd) latestEnd = d;
                }
            }

            // Legacy fallback — only if no resolved tickets exist. Mirrors
            // src/app/api/projects/[id]/amortization to avoid double-counting
            // when ticket allocations already cover the legacy basis.
            const legacyRemaining = Math.max(
                0,
                project.startingBalance - project.startingAmortization
            );
            if (tickets.length === 0 && legacyRemaining > 0 && project.launchDate && project.amortizationMonths > 0) {
                const launch = new Date(project.launchDate);
                const start = new Date(launch.getFullYear(), launch.getMonth() + 1, 1);
                const monthly = legacyRemaining / project.amortizationMonths;
                costBasis = project.startingBalance;
                monthlySteadyRate = monthly;
                maxAmortMonths = project.amortizationMonths;
                if (!earliestStart || start < earliestStart) earliestStart = start;

                for (let i = 0; i < project.amortizationMonths; i++) {
                    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
                    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                    monthCharges.set(key, (monthCharges.get(key) || 0) + monthly);
                    if (!latestEnd || d > latestEnd) latestEnd = d;
                }
            }

            // Apply admin overrides to forecasted months. Past-period charges
            // posted as journal entries are already baked into the books; the
            // override here only affects the schedule's forward projection.
            for (const ov of project.amortOverrides) {
                monthCharges.set(`${ov.year}-${ov.month}`, ov.charge);
            }

            if (!earliestStart || !latestEnd) return [];

            const rows: ScheduleRow[] = [];
            let accumulated = project.startingAmortization || 0;
            const cursor = new Date(earliestStart);
            while (cursor <= latestEnd) {
                const m = cursor.getMonth() + 1;
                const y = cursor.getFullYear();
                const charge = monthCharges.get(`${y}-${m}`) || 0;
                accumulated += charge;
                const nbv = Math.max(0, costBasis - accumulated);
                const isProjected = cursor > now;

                rows.push({
                    month: m,
                    year: y,
                    label: `${MONTH_NAMES[cursor.getMonth()]} ${y}`,
                    amortizationExpense: charge,
                    accumulatedAmortization: accumulated,
                    netBookValue: nbv,
                    isProjected,
                });

                cursor.setMonth(cursor.getMonth() + 1);
            }

            return [{
                projectId: project.id,
                projectName: project.name,
                epicKey: project.epicKey,
                status: project.status,
                ticketCount: tickets.length,
                costBasis,
                usefulLifeMonths: maxAmortMonths,
                launchDate: project.launchDate,
                monthlyRate: monthlySteadyRate,
                hasOverrides: project.amortOverrides.length > 0,
                rows,
            }];
        });

        return NextResponse.json({ schedules });
    } catch (error) {
        console.error('Amortization schedule error:', error);
        return NextResponse.json({ error: 'Failed to generate schedule' }, { status: 500 });
    }
}
