import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { AmortizationOverrideSchema, formatZodError } from '@/lib/validations';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * GET /api/projects/[id]/amortization
 * Returns the amortization schedule aggregated from underlying ticket-level schedules.
 * Each ticket with capitalizedAmount > 0 and a resolutionDate generates its own
 * straight-line schedule. These are summed into a unified project-level schedule.
 * Project-level overrides are applied on top.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const project = await prisma.project.findUnique({
            where: { id: params.id },
            include: {
                amortOverrides: true,
                tickets: {
                    where: {
                        capitalizedAmount: { gt: 0 },
                        resolutionDate: { not: null },
                    },
                    select: {
                        ticketId: true,
                        capitalizedAmount: true,
                        amortizationMonths: true,
                        resolutionDate: true,
                    },
                },
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Filter tickets that can actually amortize
        const amortizableTickets = project.tickets.filter(
            (t) => t.capitalizedAmount > 0 && t.resolutionDate && t.amortizationMonths > 0
        );

        // Also check project-level amortization (for legacy/manually-added projects)
        const hasProjectLevelAmort = project.launchDate && project.amortizationMonths > 0 && 
            (project.accumulatedCost + project.startingBalance) > 0;

        if (amortizableTickets.length === 0 && !hasProjectLevelAmort) {
            return NextResponse.json({ rows: [], costBasis: 0, defaultMonthly: 0, hasOverrides: false });
        }

        // ── Build per-month aggregate from ticket schedules ────────────
        // Map: "YYYY-M" → total charge for that month
        const monthCharges = new Map<string, number>();
        let totalCostBasis = 0;
        let earliestStart: Date | null = null;
        let latestEnd: Date | null = null;

        for (const ticket of amortizableTickets) {
            const capAmt = ticket.capitalizedAmount;
            const months = ticket.amortizationMonths;
            const resDate = new Date(ticket.resolutionDate!);
            const amortStart = new Date(resDate.getFullYear(), resDate.getMonth() + 1, 1);
            const monthlyCharge = capAmt / months;
            totalCostBasis += capAmt;

            if (!earliestStart || amortStart < earliestStart) earliestStart = amortStart;

            for (let i = 0; i < months; i++) {
                const d = new Date(amortStart.getFullYear(), amortStart.getMonth() + i, 1);
                const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                monthCharges.set(key, (monthCharges.get(key) || 0) + monthlyCharge);

                if (!latestEnd || d > latestEnd) latestEnd = d;
            }
        }

        // If there are also project-level costs (starting balance, manual entries), include those
        if (hasProjectLevelAmort) {
            const projCost = project.accumulatedCost + project.startingBalance;
            const startingAmort = project.startingAmortization || 0;
            const remainingCost = Math.max(0, projCost - startingAmort);
            // Only add project-level if there are no ticket-level entries (avoid double counting)
            if (amortizableTickets.length === 0 && remainingCost > 0) {
                totalCostBasis = projCost;
                const launch = new Date(project.launchDate!);
                const amortStart = new Date(launch.getFullYear(), launch.getMonth() + 1, 1);
                const monthlyCharge = remainingCost / project.amortizationMonths;

                if (!earliestStart || amortStart < earliestStart) earliestStart = amortStart;

                for (let i = 0; i < project.amortizationMonths; i++) {
                    const d = new Date(amortStart.getFullYear(), amortStart.getMonth() + i, 1);
                    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                    monthCharges.set(key, (monthCharges.get(key) || 0) + monthlyCharge);
                    if (!latestEnd || d > latestEnd) latestEnd = d;
                }
            }
        }

        if (!earliestStart || !latestEnd) {
            return NextResponse.json({ rows: [], costBasis: 0, defaultMonthly: 0, hasOverrides: false });
        }

        // ── Build override lookup ─────────────────────────────────────
        const overrideMap = new Map<string, number>();
        for (const ov of project.amortOverrides) {
            overrideMap.set(`${ov.year}-${ov.month}`, ov.charge);
        }

        // ── Build the combined schedule ───────────────────────────────
        const now = new Date();
        const rows: {
            month: number; year: number; label: string;
            charge: number; isOverridden: boolean;
            accumulated: number; nbv: number; opening: number; isFuture: boolean;
        }[] = [];

        const startingAmort = project.startingAmortization || 0;
        let accumulated = startingAmort;

        // Iterate from earliest to latest month
        const cursor = new Date(earliestStart);
        while (cursor <= latestEnd) {
            const m = cursor.getMonth() + 1;
            const y = cursor.getFullYear();
            const key = `${y}-${m}`;

            const isOverridden = overrideMap.has(key);
            const defaultCharge = monthCharges.get(key) || 0;
            const charge = isOverridden ? overrideMap.get(key)! : defaultCharge;

            const opening = Math.max(0, totalCostBasis - accumulated);
            accumulated += charge;
            const nbv = Math.max(0, totalCostBasis - accumulated);
            const isFuture = cursor > now;

            rows.push({
                month: m, year: y,
                label: `${MONTH_NAMES[cursor.getMonth()]} ${y}`,
                charge: Math.round(charge * 100) / 100,
                isOverridden,
                opening: Math.round(opening * 100) / 100,
                accumulated: Math.round(accumulated * 100) / 100,
                nbv: Math.round(nbv * 100) / 100,
                isFuture,
            });

            cursor.setMonth(cursor.getMonth() + 1);
        }

        // Compute default monthly as total cost basis / longest ticket amort period
        const maxAmortMonths = amortizableTickets.length > 0
            ? Math.max(...amortizableTickets.map(t => t.amortizationMonths))
            : project.amortizationMonths;
        const defaultMonthly = maxAmortMonths > 0
            ? Math.max(0, totalCostBasis - startingAmort) / maxAmortMonths
            : 0;

        return NextResponse.json({
            rows,
            costBasis: Math.round(totalCostBasis * 100) / 100,
            defaultMonthly: Math.round(defaultMonthly * 100) / 100,
            hasOverrides: project.amortOverrides.length > 0,
        });
    } catch (error) {
        console.error('Amortization GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
    }
}

/**
 * PUT /api/projects/[id]/amortization
 * Accepts { overrides: [{ month, year, charge }] } and upserts them.
 * Send { reset: true } to clear all overrides.
 */
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = AmortizationOverrideSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const body = parsed.data;

        // Reset all overrides
        if ('reset' in body && body.reset) {
            await prisma.amortizationOverride.deleteMany({
                where: { projectId: params.id },
            });
            return NextResponse.json({ ok: true, cleared: true });
        }

        // Upsert individual overrides
        const overrides = 'overrides' in body ? body.overrides : [];

        for (const ov of overrides) {
            await prisma.amortizationOverride.upsert({
                where: {
                    projectId_month_year: {
                        projectId: params.id,
                        month: ov.month,
                        year: ov.year,
                    },
                },
                update: { charge: ov.charge },
                create: {
                    projectId: params.id,
                    month: ov.month,
                    year: ov.year,
                    charge: ov.charge,
                },
            });
        }

        return NextResponse.json({ ok: true, count: overrides.length });
    } catch (error) {
        console.error('Amortization PUT error:', error);
        return NextResponse.json({ error: 'Failed to save overrides' }, { status: 500 });
    }
}
