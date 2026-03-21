import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { computeLoadedCost } from '@/lib/costUtils';
import prisma from '@/lib/prisma';
import { CreateProjectSchema, UpdateProjectSchema, formatZodError } from '@/lib/validations';

export async function GET() {
    try {
        const currentYear = new Date().getFullYear();

        // ── Parallelize all independent queries ──
        const [projects, fringeConfig, developers, payrollImports, allTickets] = await Promise.all([
            prisma.project.findMany({
                include: {
                    _count: { select: { tickets: true, journalEntries: true } },
                    tickets: {
                        select: { storyPoints: true, issueType: true, capitalizedAmount: true },
                    },
                    journalEntries: {
                        where: { entryType: 'AMORTIZATION' },
                        select: { amount: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
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
                    resolutionDate: true, createdAt: true,
                },
            }),
        ]);

        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;

        // ── Pre-group tickets by assigneeId for O(1) lookup ──
        const ticketsByDev = new Map<string, typeof allTickets>();
        for (const t of allTickets) {
            if (!t.assigneeId) continue;
            const arr = ticketsByDev.get(t.assigneeId);
            if (arr) arr.push(t);
            else ticketsByDev.set(t.assigneeId, [t]);
        }

        // ── Compute per-project costs by distributing payroll ──
        const projectCosts: Record<string, { ytd: number; itd: number }> = {};
        for (const p of projects) {
            projectCosts[p.id] = { ytd: 0, itd: 0 };
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
                const totalCost = computeLoadedCost(salary, fringeRate, sbc);
                if (totalCost <= 0) continue;

                // "Open during period": still open OR resolved during this month
                const devTickets = (ticketsByDev.get(dev.id) || []).filter(t => {
                    if (!t.resolutionDate) return true; // still open = being worked on
                    const rd = new Date(t.resolutionDate);
                    return rd >= monthStart && rd <= monthEnd;
                });

                const totalPoints = devTickets.reduce((s, t) => s + t.storyPoints, 0);
                if (totalPoints <= 0) continue;

                const projPoints: Record<string, number> = {};
                for (const t of devTickets) {
                    if (t.projectId) {
                        projPoints[t.projectId] = (projPoints[t.projectId] || 0) + t.storyPoints;
                    }
                }

                for (const [projId, points] of Object.entries(projPoints)) {
                    const amount = (points / totalPoints) * totalCost;
                    if (!projectCosts[projId]) {
                        projectCosts[projId] = { ytd: 0, itd: 0 };
                    }
                    projectCosts[projId].itd += amount;
                    if (isCurrentYear) {
                        projectCosts[projId].ytd += amount;
                    }
                }
            }
        }

        // ── Build response ──
        const projectsWithStats = projects.map((p) => {
            const proj = p as Record<string, unknown>;
            const costs = projectCosts[p.id] || { ytd: 0, itd: 0 };
            const itdCost = costs.itd + p.startingBalance;
            const ytdCost = costs.ytd;

            const storyPoints = p.tickets.reduce((s, t) => s + t.storyPoints, 0);
            const bugCount = p.tickets.filter((t) => t.issueType.toUpperCase() === 'BUG').length;
            const capitalizedAmount = p.tickets.reduce((s, t) => s + (t.capitalizedAmount || 0), 0) + p.startingBalance;
            const depreciation = p.journalEntries.reduce((s, e) => s + e.amount, 0) + p.startingAmortization;
            const netAssetValue = Math.max(0, capitalizedAmount - depreciation);
            return {
                id: p.id,
                name: p.name,
                description: p.description,
                epicKey: p.epicKey,
                status: p.status,
                isCapitalizable: p.isCapitalizable,
                amortizationMonths: p.amortizationMonths,
                totalCost: itdCost,
                accumulatedCost: ytdCost,
                ytdCost,
                itdCost,
                capitalizedAmount,
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
        const { name, description, epicKey, status, isCapitalizable, amortizationMonths, startDate, launchDate, startingBalance, startingAmortization } = parsed.data;

        const project = await prisma.project.create({
            data: {
                name,
                description: description || null,
                epicKey,
                status,
                isCapitalizable,
                amortizationMonths,
                startDate: startDate ? new Date(startDate) : null,
                launchDate: launchDate ? new Date(launchDate) : null,
                startingBalance,
                startingAmortization,
            },
        });

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
            mgmtAuthorized, probableToComplete,
        } = parsed.data;

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
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Project update error:', error);
        return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }
}
