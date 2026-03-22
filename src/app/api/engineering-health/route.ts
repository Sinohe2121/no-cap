export const dynamic = "force-dynamic";
import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { computeLoadedCost } from '@/lib/costUtils';
import { ISSUE_TYPES } from '@/lib/constants';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');
        const now = new Date();
        const periodEnd = endParam ? new Date(endParam + 'T23:59:59') : now;
        const periodStart = startParam ? new Date(startParam + 'T00:00:00') : new Date(now.getFullYear(), 0, 1);

        // ── Fringe config ──
        const fringeConfig = await prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } });
        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;

        // ── Load all tickets with assignee + project info ──
        const tickets = await prisma.jiraTicket.findMany({
            where: {
                assigneeId: { not: null },
            },
            select: {
                id: true,
                ticketId: true,
                issueType: true,
                storyPoints: true,
                summary: true,
                createdAt: true,
                resolutionDate: true,
                assigneeId: true,
                projectId: true,
                assignee: { select: { id: true, name: true, role: true, isActive: true } },
                project: { select: { id: true, name: true, isCapitalizable: true, status: true } },
            },
        });

        // ── Load developers with payroll for cost calculation ──
        const developers = await prisma.developer.findMany({
            where: { isActive: true },
            select: { id: true, name: true, role: true, fringeBenefitRate: true, stockCompAllocation: true },
        });

        const payrollImports = await prisma.payrollImport.findMany({
            where: {
                payDate: { gte: periodStart, lte: periodEnd },
            },
            include: { entries: { select: { developerId: true, grossSalary: true } } },
        });

        // ── Build per-developer period cost ──
        const devPeriodCost: Record<string, number> = {};
        for (const imp of payrollImports) {
            for (const entry of imp.entries) {
                const dev = developers.find(d => d.id === entry.developerId);
                if (!dev) continue;
                const loaded = computeLoadedCost(entry.grossSalary, dev.fringeBenefitRate || globalFringeRate, dev.stockCompAllocation);
                devPeriodCost[entry.developerId] = (devPeriodCost[entry.developerId] || 0) + loaded;
            }
        }

        // ── 1. Bug vs Feature monthly distribution (12-month lookback) ──
        const twelveMonthsAgo = new Date(periodEnd);
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);

        const monthlyDistribution: { month: string; features: number; bugs: number; tasks: number; total: number }[] = [];
        for (let i = 0; i < 12; i++) {
            const m = new Date(twelveMonthsAgo);
            m.setMonth(m.getMonth() + i);
            const monthKey = m.toLocaleString('en-US', { month: 'short', year: '2-digit' });
            const monthStart = new Date(m.getFullYear(), m.getMonth(), 1);
            const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59);

            const monthTickets = tickets.filter(t => {
                const d = t.resolutionDate ? new Date(t.resolutionDate) : new Date(t.createdAt);
                return d >= monthStart && d <= monthEnd;
            });

            const features = monthTickets.filter(t => t.issueType === ISSUE_TYPES.STORY).reduce((s, t) => s + t.storyPoints, 0);
            const bugs = monthTickets.filter(t => t.issueType === ISSUE_TYPES.BUG).reduce((s, t) => s + t.storyPoints, 0);
            const tasks = monthTickets.filter(t => t.issueType === ISSUE_TYPES.TASK || t.issueType === ISSUE_TYPES.SUBTASK).reduce((s, t) => s + t.storyPoints, 0);

            monthlyDistribution.push({ month: monthKey, features, bugs, tasks, total: features + bugs + tasks });
        }

        // ── 2. Cycle time distribution (resolved tickets) ──
        const resolvedTickets = tickets.filter(t => t.resolutionDate);
        const cycleTimes = resolvedTickets.map(t => {
            const created = new Date(t.createdAt).getTime();
            const resolved = new Date(t.resolutionDate!).getTime();
            return Math.max(1, Math.round((resolved - created) / (1000 * 60 * 60 * 24)));
        });

        const cycleTimeBuckets = [
            { label: '1-3 days', min: 1, max: 3, count: 0 },
            { label: '4-7 days', min: 4, max: 7, count: 0 },
            { label: '1-2 weeks', min: 8, max: 14, count: 0 },
            { label: '2-4 weeks', min: 15, max: 28, count: 0 },
            { label: '1-2 months', min: 29, max: 60, count: 0 },
            { label: '2+ months', min: 61, max: 9999, count: 0 },
        ];
        for (const ct of cycleTimes) {
            const bucket = cycleTimeBuckets.find(b => ct >= b.min && ct <= b.max);
            if (bucket) bucket.count++;
        }

        const avgCycleTime = cycleTimes.length > 0 ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : 0;
        const medianCycleTime = cycleTimes.length > 0
            ? [...cycleTimes].sort((a, b) => a - b)[Math.floor(cycleTimes.length / 2)]
            : 0;

        // ── 3. Developer effort heatmap ──
        // Get unique projects active in the period
        const projectIds = Array.from(new Set(tickets.filter(t => t.projectId).map(t => t.projectId!)));
        const projects = await prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true, isCapitalizable: true },
        });

        const heatmapDevs = developers.slice(0, 15); // Cap at 15 for readability
        const heatmap: {
            developer: { id: string; name: string };
            projects: { projectId: string; projectName: string; points: number; pct: number }[];
            bugPoints: number;
            totalPoints: number;
            capRatio: number;
        }[] = [];

        for (const dev of heatmapDevs) {
            const devTickets = tickets.filter(t => t.assigneeId === dev.id);
            const totalPoints = devTickets.reduce((s, t) => s + t.storyPoints, 0);
            const bugPoints = devTickets.filter(t => t.issueType === ISSUE_TYPES.BUG).reduce((s, t) => s + t.storyPoints, 0);
            const capPoints = devTickets.filter(t => t.project?.isCapitalizable).reduce((s, t) => s + t.storyPoints, 0);

            const projectBreakdown: Record<string, number> = {};
            for (const t of devTickets) {
                if (t.projectId) {
                    projectBreakdown[t.projectId] = (projectBreakdown[t.projectId] || 0) + t.storyPoints;
                }
            }

            const projectEntries = Object.entries(projectBreakdown).map(([pid, pts]) => {
                const proj = projects.find(p => p.id === pid);
                return {
                    projectId: pid,
                    projectName: proj?.name || 'Unknown',
                    points: pts,
                    pct: totalPoints > 0 ? Math.round((pts / totalPoints) * 100) : 0,
                };
            }).sort((a, b) => b.points - a.points);

            heatmap.push({
                developer: { id: dev.id, name: dev.name },
                projects: projectEntries,
                bugPoints,
                totalPoints,
                capRatio: totalPoints > 0 ? Math.round((capPoints / totalPoints) * 100) : 0,
            });
        }

        // ── 4. Top 10 most expensive tickets ──
        // Estimate ticket cost = (dev loaded cost / dev total SP) * ticket SP
        const devTotalPoints: Record<string, number> = {};
        for (const t of tickets) {
            if (t.assigneeId) {
                devTotalPoints[t.assigneeId] = (devTotalPoints[t.assigneeId] || 0) + t.storyPoints;
            }
        }

        const ticketsWithCost = tickets
            .filter(t => t.assigneeId && t.storyPoints > 0 && devPeriodCost[t.assigneeId] && devTotalPoints[t.assigneeId])
            .map(t => {
                const costPerPoint = devPeriodCost[t.assigneeId!] / devTotalPoints[t.assigneeId!];
                return {
                    ticketId: t.ticketId,
                    summary: t.summary,
                    issueType: t.issueType,
                    storyPoints: t.storyPoints,
                    developer: t.assignee?.name || 'Unknown',
                    project: t.project?.name || 'Unlinked',
                    estimatedCost: Math.round(costPerPoint * t.storyPoints),
                    isCapitalizable: t.project?.isCapitalizable || false,
                };
            })
            .sort((a, b) => b.estimatedCost - a.estimatedCost)
            .slice(0, 10);

        // ── 5. Summary KPIs ──
        const periodTickets = tickets.filter(t => {
            const d = t.resolutionDate ? new Date(t.resolutionDate) : new Date(t.createdAt);
            return d >= periodStart && d <= periodEnd;
        });
        const totalSP = periodTickets.reduce((s, t) => s + t.storyPoints, 0);
        const bugSP = periodTickets.filter(t => t.issueType === ISSUE_TYPES.BUG).reduce((s, t) => s + t.storyPoints, 0);
        const featureSP = periodTickets.filter(t => t.issueType === ISSUE_TYPES.STORY).reduce((s, t) => s + t.storyPoints, 0);
        const capSP = periodTickets.filter(t => t.project?.isCapitalizable).reduce((s, t) => s + t.storyPoints, 0);

        const totalBugCost = ticketsWithCost.filter(t => t.issueType === ISSUE_TYPES.BUG).reduce((s, t) => s + t.estimatedCost, 0);
        const totalDevSpend = Object.values(devPeriodCost).reduce((a, b) => a + b, 0);

        return NextResponse.json({
            summary: {
                totalTickets: periodTickets.length,
                totalStoryPoints: totalSP,
                bugStoryPoints: bugSP,
                featureStoryPoints: featureSP,
                capRatio: totalSP > 0 ? Math.round((capSP / totalSP) * 100) : 0,
                bugRatio: totalSP > 0 ? Math.round((bugSP / totalSP) * 100) : 0,
                avgCycleTimeDays: Math.round(avgCycleTime * 10) / 10,
                medianCycleTimeDays: medianCycleTime,
                totalBugCost,
                totalDevSpend,
                activeDevelopers: developers.length,
            },
            monthlyDistribution,
            cycleTimeBuckets,
            heatmap,
            topExpensiveTickets: ticketsWithCost,
            projects: projects.map(p => ({ id: p.id, name: p.name })),
        });
    } catch (error) {
        console.error('Engineering health error:', error);
        return NextResponse.json({ error: 'Failed to compute engineering health data' }, { status: 500 });
    }
}
