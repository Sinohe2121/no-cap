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

        const fringeConfig = await prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } });
        const meetingConfig = await prisma.globalConfig.findUnique({ where: { key: 'MEETING_TIME_RATE' } });
        const bugSpConfig = await prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } });
        const otherSpConfig = await prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } });
        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;
        const globalMeetingRate = meetingConfig ? parseFloat(meetingConfig.value) : 0;
        const bugSpFallback = parseFloat(bugSpConfig?.value ?? '1') || 1;
        const otherSpFallback = parseFloat(otherSpConfig?.value ?? '1') || 1;
        // Applied SP: use configured fallback for 0-SP tickets so bugs/tasks carry their cost weight
        const appliedSP = (t: { storyPoints: number; issueType: string }): number =>
            t.storyPoints > 0 ? t.storyPoints
            : t.issueType?.toUpperCase() === 'BUG' ? bugSpFallback : otherSpFallback;

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
                allocatedAmount: true,
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

        // Fetch the most recent payroll import (across ALL time) for headcount
        const latestPayrollImport = await prisma.payrollImport.findFirst({
            orderBy: { payDate: 'desc' },
            include: { entries: { select: { developerId: true } } },
        });
        const activeDevelopers = latestPayrollImport
            ? new Set(latestPayrollImport.entries.map(e => e.developerId)).size
            : 0;


        const devPeriodCost: Record<string, number> = {};
        for (const imp of payrollImports) {
            for (const entry of imp.entries) {
                const dev = developers.find(d => d.id === entry.developerId);
                if (!dev) continue;
                const gross = computeLoadedCost(entry.grossSalary, dev.fringeBenefitRate || globalFringeRate, dev.stockCompAllocation);
                // Apply meeting rate — matches dashboard formula
                const net = gross * (1 - globalMeetingRate);
                devPeriodCost[entry.developerId] = (devPeriodCost[entry.developerId] || 0) + net;
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
            // Use appliedSP so 0-SP bugs carry their weight in percentages and ratios
            const totalPoints = devTickets.reduce((s, t) => s + appliedSP(t), 0);
            const bugPoints = devTickets.filter(t => t.issueType === ISSUE_TYPES.BUG).reduce((s, t) => s + appliedSP(t), 0);
            // Cap = STORY tickets on capitalizable projects only (ASC 350-40)
            const capPoints = devTickets
                .filter(t => t.issueType === ISSUE_TYPES.STORY && t.project?.isCapitalizable)
                .reduce((s, t) => s + appliedSP(t), 0);

            const projectBreakdown: Record<string, number> = {};
            for (const t of devTickets) {
                if (t.projectId) {
                    projectBreakdown[t.projectId] = (projectBreakdown[t.projectId] || 0) + appliedSP(t);
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
        // Source: allocatedAmount field on JiraTicket (populated by ticketCostPersist using applied SP).
        // This is the canonical cost allocation table driven by applied SP, not raw Jira SP.
        const ticketsWithCost = tickets
            .filter(t => t.allocatedAmount && t.allocatedAmount > 0)
            .map(t => ({
                ticketId: t.ticketId,
                summary: t.summary,
                issueType: t.issueType,
                storyPoints: t.storyPoints,
                developer: t.assignee?.name || 'Unknown',
                project: t.project?.name || 'Unlinked',
                estimatedCost: Math.round(t.allocatedAmount || 0),
                isCapitalizable: t.project?.isCapitalizable || false,
            }))
            .sort((a, b) => b.estimatedCost - a.estimatedCost)
            .slice(0, 10);

        // ── 5. Summary KPIs ──
        // Use allocatedAmount (from cost allocation table) as the canonical cost basis for all ratios.
        // allocatedAmount is pre-computed by ticketCostPersist using applied SP weights.
        const periodTickets = tickets.filter(t => {
            const d = t.resolutionDate ? new Date(t.resolutionDate) : new Date(t.createdAt);
            return d >= periodStart && d <= periodEnd;
        });
        const totalSP = periodTickets.reduce((s, t) => s + t.storyPoints, 0);
        const bugSP = periodTickets.filter(t => t.issueType === ISSUE_TYPES.BUG).reduce((s, t) => s + appliedSP(t), 0);
        const featureSP = periodTickets.filter(t => t.issueType === ISSUE_TYPES.STORY).reduce((s, t) => s + appliedSP(t), 0);

        // Total allocated cost for all period tickets (from allocation table)
        const totalAllocatedCost = periodTickets.reduce((s, t) => s + (t.allocatedAmount || 0), 0);
        // Capitalized = STORY tickets on capitalizable projects
        const capAllocatedCost = periodTickets
            .filter(t => t.issueType === ISSUE_TYPES.STORY && t.project?.isCapitalizable)
            .reduce((s, t) => s + (t.allocatedAmount || 0), 0);
        // Bug cost = all bug tickets' allocated amount
        const totalBugCost = periodTickets
            .filter(t => t.issueType === ISSUE_TYPES.BUG)
            .reduce((s, t) => s + (t.allocatedAmount || 0), 0);
        const bugAllocatedCost = periodTickets
            .filter(t => t.issueType === ISSUE_TYPES.BUG)
            .reduce((s, t) => s + (t.allocatedAmount || 0), 0);

        const totalDevSpend = Object.values(devPeriodCost).reduce((a, b) => a + b, 0);

        return NextResponse.json({
            summary: {
                totalTickets: periodTickets.length,
                totalStoryPoints: totalSP,
                bugStoryPoints: bugSP,
                featureStoryPoints: featureSP,
                // Ratios driven by allocatedAmount (applied SP allocation table)
                capRatio: totalAllocatedCost > 0 ? Math.round((capAllocatedCost / totalAllocatedCost) * 100) : 0,
                bugRatio: totalAllocatedCost > 0 ? Math.round((bugAllocatedCost / totalAllocatedCost) * 100) : 0,
                avgCycleTimeDays: Math.round(avgCycleTime * 10) / 10,
                medianCycleTimeDays: medianCycleTime,
                totalBugCost,
                totalDevSpend,
                activeDevelopers,
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
