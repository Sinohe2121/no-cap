export const dynamic = "force-dynamic";
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

        // Fetch developers + latest payroll import + SP fallback configs
        const [developers, latestPayrollImport, bugSpConfig, otherSpConfig] = await Promise.all([
            prisma.developer.findMany({
                where: { isActive: true },
                include: {
                    tickets: {
                        include: {
                            project: { select: { id: true, name: true, isCapitalizable: true } },
                            auditTrails: { select: { allocatedAmount: true } },
                        },
                    },
                },
            }),
            prisma.payrollImport.findFirst({
                orderBy: { payDate: 'desc' },
                include: { entries: { select: { developerId: true } } },
            }),
            prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
            prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
        ]);

        const bugSpFallback = parseFloat(bugSpConfig?.value ?? '1') || 1;
        const otherSpFallback = parseFloat(otherSpConfig?.value ?? '1') || 1;

        /** Applied SP: matches journal entry logic — raw SP if > 0, else type-specific fallback */
        const appliedSP = (t: { storyPoints: number; issueType: string }): number => {
            if (t.storyPoints > 0) return t.storyPoints;
            return t.issueType === 'BUG' ? bugSpFallback : otherSpFallback;
        };

        // Payroll headcount = unique developers in the most recent payroll import
        const payrollDevIds = new Set(latestPayrollImport?.entries.map(e => e.developerId) ?? []);
        const payrollHeadcount = payrollDevIds.size; // authoritative: 49

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
            jiraSP: number;      // raw Jira story points
            appliedSP: number;   // with bug/task fallbacks applied
            ticketCount: number;
            bugSP: number;       // applied SP for bug tickets
            allocatedCost: number;
            capSP: number;       // applied SP on capitalizable STORY tickets
        }

        interface TeamData {
            projectId: string;
            projectName: string;
            members: TeamMember[];
            totalSP: number;        // raw JIRA SP
            totalAppliedSP: number; // applied SP (used for cap ratio & cost/SP)
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
                    totalAppliedSP: 0,
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

            const devJiraSP    = periodTickets.reduce((s, t) => s + (t.storyPoints || 0), 0);
            const devAppliedSP = periodTickets.reduce((s, t) => s + appliedSP(t), 0);
            const devBugSP     = periodTickets
                .filter(t => t.issueType === 'Bug' || t.issueType === 'BUG')
                .reduce((s, t) => s + appliedSP(t), 0);
            // Cap SP = applied SP on capitalizable STORY tickets only
            const devCapSP = periodTickets
                .filter(t => t.issueType === 'STORY' && t.project?.isCapitalizable)
                .reduce((s, t) => s + appliedSP(t), 0);
            const devCost = periodTickets.reduce((s, t) => {
                const trailCost = (t as any).auditTrails?.reduce((a: number, at: any) => a + (at.allocatedAmount || 0), 0) || 0;
                return s + trailCost;
            }, 0);

            teamMap[primaryProject.id].members.push({
                id: dev.id,
                name: dev.name,
                jiraSP: devJiraSP,
                appliedSP: devAppliedSP,
                ticketCount: periodTickets.length,
                bugSP: devBugSP,
                allocatedCost: Math.round(devCost),
                capSP: devCapSP,
            });
        }

        // Aggregate team totals
        const teams: TeamData[] = Object.values(teamMap).map(team => {
            team.totalSP        = team.members.reduce((s, m) => s + m.jiraSP, 0);
            team.totalAppliedSP = team.members.reduce((s, m) => s + m.appliedSP, 0);
            team.totalTickets   = team.members.reduce((s, m) => s + m.ticketCount, 0);
            team.totalCost      = team.members.reduce((s, m) => s + m.allocatedCost, 0);
            team.bugSP          = team.members.reduce((s, m) => s + m.bugSP, 0);
            team.capSP          = team.members.reduce((s, m) => s + m.capSP, 0);
            // Cap ratio uses applied SP as denominator (matches journal entry math)
            team.capRatio  = team.totalAppliedSP > 0 ? Math.round((team.capSP / team.totalAppliedSP) * 100) : 0;
            team.bugRatio  = team.totalAppliedSP > 0 ? Math.round((team.bugSP  / team.totalAppliedSP) * 100) : 0;
            team.costPerSP = team.totalAppliedSP > 0 ? Math.round(team.totalCost / team.totalAppliedSP) : 0;

            // Sort members by SP descending
            team.members.sort((a, b) => b.appliedSP - a.appliedSP);
            return team;
        });

        // Sort teams by total cost descending
        teams.sort((a, b) => b.totalCost - a.totalCost);

        // Summary — compute 3-segment developer breakdown
        // closedTicketDevs: devs who made it into teamMap (they had tickets in the period by creation date)
        const devsInTeams = new Set(teams.flatMap(t => t.members.map(m => m.id)));

        // openTicketDevs: active devs with tickets created in period but NOT resolved (not in teamMap)
        // We detect this by checking which active devs have tickets in the range that are unresolved
        const openDevIds = new Set<string>();
        for (const dev of developers) {
            if (devsInTeams.has(dev.id)) continue; // already counted as closed
            const hasTicketInRange = dev.tickets.some(t => {
                if (!isInRange(t)) return false;
                return !t.resolutionDate; // unresolved = open/in-progress
            });
            if (hasTicketInRange) openDevIds.add(dev.id);
        }

        const totalActive = developers.length;
        const closedTicketDevs = devsInTeams.size;
        const openTicketDevs = openDevIds.size;
        const noTicketDevs = Math.max(0, payrollHeadcount - closedTicketDevs - openTicketDevs);

        const summary = {
            totalTeams: teams.length,
            totalDevs: devsInTeams.size + openDevIds.size,
            closedTicketDevs,
            openTicketDevs,
            noTicketDevs,
            totalPayrollDevs: payrollHeadcount,
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
