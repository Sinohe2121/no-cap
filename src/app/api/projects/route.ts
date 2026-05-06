export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CreateProjectSchema, UpdateProjectSchema, formatZodError } from '@/lib/validations';
import { invalidatePeriodCostsCache } from '@/lib/calculationsCache';
import { ENTRY_TYPES } from '@/lib/constants';

export async function GET() {
    try {
        // ── Fiscal-year window for YTD scoping ──
        // Periods are stored as (month, year) on AccountingPeriod. We derive a
        // [start, end] (month, year) range from the configured fiscal-year start
        // month, then test each posted JE's period against it.
        const fyConfig = await prisma.globalConfig.findUnique({ where: { key: 'FISCAL_YEAR_START_MONTH' } });
        const fyStartMonth = (() => {
            const raw = fyConfig ? parseInt(fyConfig.value, 10) : 1;
            return Number.isFinite(raw) ? Math.min(12, Math.max(1, raw)) : 1;
        })();
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayYear = today.getFullYear();
        const fyStartYear = todayMonth >= fyStartMonth ? todayYear : todayYear - 1;
        const fyEndMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1;
        const fyEndYear = fyStartMonth === 1 ? fyStartYear : fyStartYear + 1;
        const fyStartIdx = fyStartYear * 12 + (fyStartMonth - 1);
        const fyEndIdx = fyEndYear * 12 + (fyEndMonth - 1);
        const inFiscalYear = (m: number, y: number) => {
            const idx = y * 12 + (m - 1);
            return idx >= fyStartIdx && idx <= fyEndIdx;
        };

        const projects = await prisma.project.findMany({
            select: {
                id: true,
                name: true,
                description: true,
                epicKey: true,
                status: true,
                isCapitalizable: true,
                isQRE: true,
                amortizationMonths: true,
                accumulatedCost: true,
                startingBalance: true,
                startingAmortization: true,
                startDate: true,
                launchDate: true,
                overrideReason: true,
                mgmtAuthorized: true,
                probableToComplete: true,
                parentProjectId: true,
                _count: { select: { tickets: true, journalEntries: true } },
                tickets: {
                    select: { storyPoints: true, issueType: true },
                },
                journalEntries: {
                    where: {
                        entryType: {
                            in: [
                                ENTRY_TYPES.CAPITALIZATION,
                                ENTRY_TYPES.EXPENSE_BUG,
                                ENTRY_TYPES.EXPENSE_TASK,
                                ENTRY_TYPES.AMORTIZATION,
                            ],
                        },
                    },
                    select: {
                        entryType: true,
                        amount: true,
                        period: { select: { month: true, year: true } },
                    },
                },
                legacyChildren: {
                    select: {
                        id: true, name: true, startingBalance: true,
                        startingAmortization: true, amortizationMonths: true,
                        launchDate: true, status: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const projectsWithStats = projects.map((p) => {
            const proj = p as Record<string, unknown>;

            // ── Roll up posted journal entries (the only source of truth) ──
            // CAP totals come from project.accumulatedCost (the DB column the
            // accounting POST writes during entry generation) so the projects
            // table can never disagree with the project detail page.
            // EXP/AMORT come from posted JEs the same way.
            let ytdCapPosted = 0;
            let itdExpPosted = 0;
            let ytdExpPosted = 0;
            let itdAmortPosted = 0;
            for (const je of p.journalEntries) {
                const inFY = je.period ? inFiscalYear(je.period.month, je.period.year) : false;
                if (je.entryType === ENTRY_TYPES.CAPITALIZATION) {
                    if (inFY) ytdCapPosted += je.amount;
                } else if (je.entryType === ENTRY_TYPES.EXPENSE_BUG || je.entryType === ENTRY_TYPES.EXPENSE_TASK) {
                    itdExpPosted += je.amount;
                    if (inFY) ytdExpPosted += je.amount;
                } else if (je.entryType === ENTRY_TYPES.AMORTIZATION) {
                    itdAmortPosted += je.amount;
                }
            }

            const allocatedAmount = p.accumulatedCost + p.startingBalance;
            const itdCost = p.accumulatedCost + itdExpPosted + p.startingBalance;
            const ytdCost = ytdCapPosted + ytdExpPosted;
            const depreciation = itdAmortPosted + p.startingAmortization;
            const netAssetValue = Math.max(0, allocatedAmount - depreciation);

            const storyPoints = p.tickets.reduce((s, t) => s + t.storyPoints, 0);
            const bugCount = p.tickets.filter((t) => t.issueType.toUpperCase() === 'BUG').length;

            return {
                id: p.id,
                name: p.name,
                description: p.description,
                epicKey: p.epicKey,
                status: p.status,
                isCapitalizable: p.isCapitalizable,
                isQRE: (p as any).isQRE ?? false,
                amortizationMonths: p.amortizationMonths,
                totalCost: itdCost,
                accumulatedCost: ytdCost,
                ytdCost,
                itdCost,
                allocatedAmount,
                depreciation,
                netAssetValue,
                startingBalance: p.startingBalance,
                startingAmortization: p.startingAmortization,
                startDate: p.startDate,
                launchDate: p.launchDate,
                overrideReason: p.overrideReason,
                mgmtAuthorized: proj.mgmtAuthorized ?? false,
                probableToComplete: proj.probableToComplete ?? false,
                ticketCount: p._count.tickets,
                storyPoints,
                bugCount,
                parentProjectId: (p as any).parentProjectId || null,
                legacyChildren: (p as any).legacyChildren || [],
            };
        });

        return NextResponse.json(projectsWithStats);

    } catch (error) {
        console.error('Projects API error:', error);
        return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = CreateProjectSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { name, description, epicKey, status, isCapitalizable, amortizationMonths, startDate, launchDate, startingBalance, startingAmortization, amortizationSchedule, parentProjectId } = parsed.data;

        // Auto-generate epicKey for legacy projects if not provided
        const finalEpicKey = epicKey || `LEGACY-${Date.now().toString(36).toUpperCase().slice(-5)}`;

        const project = await prisma.project.create({
            data: {
                name,
                description: description || null,
                epicKey: finalEpicKey,
                status,
                isCapitalizable,
                amortizationMonths,
                startDate: startDate ? new Date(startDate) : null,
                launchDate: launchDate ? new Date(launchDate) : null,
                startingBalance,
                startingAmortization,
                ...(parentProjectId && { parentProjectId }),
            },
        });

        // If an amortization schedule was provided (legacy projects), persist overrides
        if (amortizationSchedule && amortizationSchedule.length > 0) {
            await prisma.amortizationOverride.createMany({
                data: amortizationSchedule.map((row) => ({
                    projectId: project.id,
                    month: row.month,
                    year: row.year,
                    charge: row.charge,
                })),
            });
        }

        return NextResponse.json(project);
    } catch (error) {
        console.error('Project create error:', error);
        return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = UpdateProjectSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const {
            id, name, description, status, isCapitalizable, overrideReason,
            startDate, startingBalance, startingAmortization, launchDate, amortizationMonths,
            mgmtAuthorized, probableToComplete, isQRE,
        } = parsed.data as any;

        const updated = await prisma.project.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(status !== undefined && { status }),
                ...(isCapitalizable !== undefined && { isCapitalizable }),
                ...(overrideReason !== undefined && { overrideReason }),
                ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
                ...(startingBalance !== undefined && { startingBalance }),
                ...(startingAmortization !== undefined && { startingAmortization }),
                ...(launchDate !== undefined && { launchDate: launchDate ? new Date(launchDate) : null }),
                ...(amortizationMonths !== undefined && { amortizationMonths }),
                ...(mgmtAuthorized !== undefined && { mgmtAuthorized }),
                ...(probableToComplete !== undefined && { probableToComplete }),
                ...(isQRE !== undefined && { isQRE }),
            },
        });

        // Project status / capitalizable / amort window all flow into cost
        // calculations — clear the cache so changes show up on next read.
        invalidatePeriodCostsCache();

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Project update error:', error);
        return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }
}
