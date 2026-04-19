export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/projects/:id/tickets
 *
 * Returns all Jira tickets for a specific project with assignee details.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;

        const project = await prisma.project.findUnique({
            where: { id },
            select: { id: true, name: true, epicKey: true, status: true },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const [tickets, legacyChildren] = await Promise.all([
            prisma.jiraTicket.findMany({
                where: { projectId: id },
                include: {
                    assignee: {
                        select: { id: true, name: true, email: true, role: true },
                    },
                },
                orderBy: [
                    { resolutionDate: 'desc' },
                    { createdAt: 'desc' },
                ],
            }),
            prisma.project.findMany({
                where: { parentProjectId: id },
                select: {
                    id: true, name: true, epicKey: true,
                    startingBalance: true, startingAmortization: true,
                    amortizationMonths: true, launchDate: true, status: true,
                },
            }),
        ]);

        // Load SP fallback config
        const [bugSpConfig, otherSpConfig] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
            prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
        ]);
        const bugSpFallback = parseFloat(bugSpConfig?.value || '1') || 1;
        const otherSpFallback = parseFloat(otherSpConfig?.value || '1') || 1;
        const getAppliedSP = (t: { storyPoints: number; issueType: string }) =>
            t.storyPoints > 0 ? t.storyPoints : t.issueType === 'BUG' ? bugSpFallback : otherSpFallback;

        // Map tickets to include appliedSP
        const mappedTickets = tickets.map(t => ({ ...t, appliedSP: getAppliedSP(t) }));

        // Compute summary stats
        const totalSP = tickets.reduce((s, t) => s + t.storyPoints, 0);
        const totalAppliedSP = mappedTickets.reduce((s, t) => s + t.appliedSP, 0);
        const stories = tickets.filter((t) => t.issueType === 'STORY');
        const bugs = tickets.filter((t) => t.issueType === 'BUG');
        const tasks = tickets.filter((t) => t.issueType === 'TASK');

        return NextResponse.json({
            project,
            tickets: mappedTickets,
            legacyChildren,
            summary: {
                totalTickets: tickets.length,
                totalStoryPoints: totalSP,
                totalAppliedSP,
                stories: stories.length,
                bugs: bugs.length,
                tasks: tasks.length,
            },
        });

    } catch (error) {
        console.error('Error fetching project tickets:', error);
        return NextResponse.json(
            { error: 'Failed to load tickets' },
            { status: 500 },
        );
    }
}
