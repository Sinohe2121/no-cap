import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Team View — groups developers by their primary project allocation
 * and computes team-level KPIs: SP, ticket count, cost, cap ratio, bug ratio.
 *
 * ?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');

        // Fetch developers with tickets + auditTrails for cost
        const developers = await prisma.developer.findMany({
            where: { isActive: true },
            include: {
                tickets: {
                    include: {
                        project: { select: { id: true, name: true, isCapitalizable: true } },
                        auditTrails: { select: { allocatedAmount: true } },
                    },
                },
            },
        });

        // Filter tickets by Jira Created date (not DB createdAt)
        const rangeStart = startParam ? new Date(startParam + 'T00:00:00').getTime() : null;
        const rangeEnd = endParam ? new Date(endParam + 'T23:59:59').getTime() : null;

        const isInRange = (ticket: any): boolean => {
            if (!rangeStart || !rangeEnd) return true;
            const jiraCreated = ticket.customFields?.Created;
            const dateStr = jiraCreated || ticket.createdAt;
            const ts = new Date(dateStr).getTime();
            if (isNaN(ts)) return true;
            return ts >= rangeStart && ts <= rangeEnd;
        };

        // Group developers by their primary project (most SP allocated)
        interface TeamMember {
            id: string;
            name: string;
            totalSP: number;
            ticketCount: number;
            bugSP: number;
            allocatedCost: number;
            capSP: number;
        }

        interface TeamData {
            projectId: string;
            projectName: string;
            members: TeamMember[];
            totalSP: number;
            totalTickets: number;
            totalCost: number;
            bugSP: number;
            capSP: number;
            capRatio: number;
            bugRatio: number;
            avgCycleTimeDays: number;
            costPerSP: number;
        }

        const teamMap: Record<string, TeamData> = {};

        for (const dev of developers) {
            // Filter tickets to selected period
            const periodTickets = dev.tickets.filter(isInRange);

            // Skip devs with no tickets in period
            if (periodTickets.length === 0) continue;

            // Determine primary project by SP
            const projectSP: Record<string, { name: string; sp: number; isCapitalizable: boolean }> = {};
            for (const t of periodTickets) {
                if (!t.project) continue;
                if (!projectSP[t.project.id]) {
                    projectSP[t.project.id] = { name: t.project.name, sp: 0, isCapitalizable: t.project.isCapitalizable };
                }
                projectSP[t.project.id].sp += t.storyPoints || 0;
            }

            // Find project with most SP
            let primaryProject = { id: 'unassigned', name: 'Unassigned' };
            let maxSP = 0;
            for (const [pid, data] of Object.entries(projectSP)) {
                if (data.sp > maxSP) {
                    maxSP = data.sp;
                    primaryProject = { id: pid, name: data.name };
                }
            }

            if (!teamMap[primaryProject.id]) {
                teamMap[primaryProject.id] = {
                    projectId: primaryProject.id,
                    projectName: primaryProject.name,
                    members: [],
                    totalSP: 0,
                    totalTickets: 0,
                    totalCost: 0,
                    bugSP: 0,
                    capSP: 0,
                    capRatio: 0,
                    bugRatio: 0,
                    avgCycleTimeDays: 0,
                    costPerSP: 0,
                };
            }

            const devSP = periodTickets.reduce((s, t) => s + (t.storyPoints || 0), 0);
            const devBugSP = periodTickets
                .filter(t => t.issueType === 'Bug' || t.issueType === 'BUG')
                .reduce((s, t) => s + (t.storyPoints || 0), 0);
            const devCapSP = periodTickets
                .filter(t => t.project?.isCapitalizable)
                .reduce((s, t) => s + (t.storyPoints || 0), 0);
            const devCost = periodTickets.reduce((s, t) => {
                const trailCost = (t as any).auditTrails?.reduce((a: number, at: any) => a + (at.allocatedAmount || 0), 0) || 0;
                return s + trailCost;
            }, 0);

            teamMap[primaryProject.id].members.push({
                id: dev.id,
                name: dev.name,
                totalSP: devSP,
                ticketCount: periodTickets.length,
                bugSP: devBugSP,
                allocatedCost: Math.round(devCost),
                capSP: devCapSP,
            });
        }

        // Aggregate team totals
        const teams: TeamData[] = Object.values(teamMap).map(team => {
            team.totalSP = team.members.reduce((s, m) => s + m.totalSP, 0);
            team.totalTickets = team.members.reduce((s, m) => s + m.ticketCount, 0);
            team.totalCost = team.members.reduce((s, m) => s + m.allocatedCost, 0);
            team.bugSP = team.members.reduce((s, m) => s + m.bugSP, 0);
            team.capSP = team.members.reduce((s, m) => s + m.capSP, 0);
            team.capRatio = team.totalSP > 0 ? Math.round((team.capSP / team.totalSP) * 100) : 0;
            team.bugRatio = team.totalSP > 0 ? Math.round((team.bugSP / team.totalSP) * 100) : 0;
            team.costPerSP = team.totalSP > 0 ? Math.round(team.totalCost / team.totalSP) : 0;

            // Sort members by SP descending
            team.members.sort((a, b) => b.totalSP - a.totalSP);
            return team;
        });

        // Sort teams by total cost descending
        teams.sort((a, b) => b.totalCost - a.totalCost);

        // Summary
        const summary = {
            totalTeams: teams.length,
            totalDevs: teams.reduce((s, t) => s + t.members.length, 0),
            totalSP: teams.reduce((s, t) => s + t.totalSP, 0),
            totalCost: Math.round(teams.reduce((s, t) => s + t.totalCost, 0)),
            avgCapRatio: teams.length > 0 ? Math.round(teams.reduce((s, t) => s + t.capRatio, 0) / teams.length) : 0,
            avgBugRatio: teams.length > 0 ? Math.round(teams.reduce((s, t) => s + t.bugRatio, 0) / teams.length) : 0,
        };

        return NextResponse.json({ teams, summary });
    } catch (error) {
        console.error('Team view error:', error);
        return NextResponse.json({ error: 'Failed to compute team view' }, { status: 500 });
    }
}
