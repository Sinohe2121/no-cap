export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { computeLoadedCost } from '@/lib/costUtils';
import prisma from '@/lib/prisma';
import { CreateProjectSchema, UpdateProjectSchema, formatZodError } from '@/lib/validations';
import { invalidatePeriodCostsCache } from '@/lib/calculationsCache';

export async function GET() {
    try {
        const currentYear = new Date().getFullYear();

        // ── Parallelize all independent queries ──
        const [projects, fringeConfig, meetingConfig, developers, payrollImports, allTickets] = await Promise.all([
            prisma.project.findMany({
                select: {
                    id: true,
                    name: true,
                    description: true,
                    epicKey: true,
                    status: true,
                    isCapitalizable: true,
                    isQRE: true,
                    amortizationMonths: true,
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
                        where: { entryType: 'AMORTIZATION' },
                        select: { amount: true },
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
            }),
            prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
            prisma.globalConfig.findUnique({ where: { key: 'MEETING_TIME_RATE' } }),
            prisma.developer.findMany({
                where: { isActive: true },
                select: { id: true, fringeBenefitRate: true, stockCompAllocation: true },
            }),
            prisma.payrollImport.findMany({
                orderBy: { payDate: 'asc' },
                include: { entries: { select: { developerId: true, grossSalary: true } } },
            }),
            prisma.jiraTicket.findMany({
                select: {
                    assigneeId: true, storyPoints: true, projectId: true,
                    issueType: true, resolutionDate: true, createdAt: true,
                },
            }),
        ]);

        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;
        const globalMeetingRate = meetingConfig ? parseFloat(meetingConfig.value) : 0;

        // Applied SP fallbacks (matches calculatePeriodCosts and dashboard)
        const BUG_SP_FALLBACK = 1;
        const OTHER_SP_FALLBACK = 1;
        const appliedSP = (t: { storyPoints: number; issueType?: string | null }) =>
            (t.storyPoints > 0) ? t.storyPoints
            : (t.issueType?.toUpperCase() === 'BUG') ? BUG_SP_FALLBACK : OTHER_SP_FALLBACK;

        // Build quick-lookup maps
        const projectMap: Record<string, { isCapitalizable: boolean }> = {};
        for (const p of projects) projectMap[p.id] = { isCapitalizable: p.isCapitalizable };

        // ── Pre-group tickets by assigneeId for O(1) lookup ──
        const ticketsByDev = new Map<string, typeof allTickets>();
        for (const t of allTickets) {
            if (!t.assigneeId) continue;
            const arr = ticketsByDev.get(t.assigneeId);
            if (arr) arr.push(t);
            else ticketsByDev.set(t.assigneeId, [t]);
        }

        // ── Compute per-project costs by distributing payroll ──
        // projectCosts.itd = total cost (cap + opex) for all-time display
        // projectCapitalized.itd = CAPEX only (STORY on capitalizable projects), matches dashboard CAPEX card
        const projectCosts: Record<string, { ytd: number; itd: number }> = {};
        const projectCapitalized: Record<string, { ytd: number; itd: number }> = {};
        for (const p of projects) {
            projectCosts[p.id] = { ytd: 0, itd: 0 };
            projectCapitalized[p.id] = { ytd: 0, itd: 0 };
        }

        for (const imp of payrollImports) {
            const pd = new Date(imp.payDate);
            const isCurrentYear = pd.getFullYear() === currentYear;
            const monthStart = new Date(pd.getFullYear(), pd.getMonth(), 1);
            const monthEnd = new Date(pd.getFullYear(), pd.getMonth() + 1, 0, 23, 59, 59);

            const salaryByDev: Record<string, number> = {};
            for (const entry of imp.entries) {
                salaryByDev[entry.developerId] = entry.grossSalary;
            }

            for (const dev of developers) {
                const salary = salaryByDev[dev.id] || 0;
                const fringeRate = dev.fringeBenefitRate || globalFringeRate;
                const sbc = dev.stockCompAllocation;
                const grossCost = computeLoadedCost(salary, fringeRate, sbc);
                // Apply meeting rate — matches dashboard CAPEX formula exactly
                const totalCost = grossCost * (1 - globalMeetingRate);
                if (totalCost <= 0) continue;

                // "Open during period": still open OR resolved during this month
                const devTickets = (ticketsByDev.get(dev.id) || []).filter(t => {
                    if (!t.resolutionDate) return true;
                    const rd = new Date(t.resolutionDate);
                    return rd >= monthStart && rd <= monthEnd;
                });

                // Apply Applied SP so developers with 0-SP tickets are included
                const totalPoints = devTickets.reduce((s, t) => s + appliedSP(t), 0);
                if (totalPoints <= 0) continue;

                // Track total cost (all types) and capex-only (STORY on capitalizable projects)
                const projPoints: Record<string, number> = {};
                const storyCapPoints: Record<string, number> = {};
                for (const t of devTickets) {
                    if (!t.projectId) continue;
                    projPoints[t.projectId] = (projPoints[t.projectId] || 0) + appliedSP(t);
                    // CAPEX: only STORY tickets on capitalizable projects (ASC 350-40)
                    if (t.issueType?.toUpperCase() === 'STORY' && projectMap[t.projectId]?.isCapitalizable) {
                        storyCapPoints[t.projectId] = (storyCapPoints[t.projectId] || 0) + appliedSP(t);
                    }
                }

                for (const [projId, points] of Object.entries(projPoints)) {
                    const amount = (points / totalPoints) * totalCost;
                    if (!projectCosts[projId]) projectCosts[projId] = { ytd: 0, itd: 0 };
                    projectCosts[projId].itd += amount;
                    if (isCurrentYear) projectCosts[projId].ytd += amount;
                }

                for (const [projId, storyPoints] of Object.entries(storyCapPoints)) {
                    const capAmount = (storyPoints / totalPoints) * totalCost;
                    if (!projectCapitalized[projId]) projectCapitalized[projId] = { ytd: 0, itd: 0 };
                    projectCapitalized[projId].itd += capAmount;
                    if (isCurrentYear) projectCapitalized[projId].ytd += capAmount;
                }
            }
        }

        // ── Build response ──
        const projectsWithStats = projects.map((p) => {
            const proj = p as Record<string, unknown>;
            const costs = projectCosts[p.id] || { ytd: 0, itd: 0 };
            const itdCost = costs.itd + p.startingBalance;
            const ytdCost = costs.ytd;

            // allocatedAmount: computed live from payroll (STORY-only on cap projects)
            // Uses same formula as dashboard CAPEX card for full consistency.
            const capCosts = projectCapitalized[p.id] || { ytd: 0, itd: 0 };
            const allocatedAmount = capCosts.itd + p.startingBalance;

            const storyPoints = p.tickets.reduce((s, t) => s + t.storyPoints, 0);
            const bugCount = p.tickets.filter((t) => t.issueType.toUpperCase() === 'BUG').length;
            const depreciation = p.journalEntries.reduce((s, e) => s + e.amount, 0) + p.startingAmortization;
            const netAssetValue = Math.max(0, allocatedAmount - depreciation);
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
