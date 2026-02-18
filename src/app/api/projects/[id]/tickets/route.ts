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

        const tickets = await prisma.jiraTicket.findMany({
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
        });

        // Compute summary stats
        const totalSP = tickets.reduce((s, t) => s + t.storyPoints, 0);
        const stories = tickets.filter((t) => t.issueType === 'STORY');
        const bugs = tickets.filter((t) => t.issueType === 'BUG');
        const tasks = tickets.filter((t) => t.issueType === 'TASK');

        return NextResponse.json({
            project,
            tickets,
            summary: {
                totalTickets: tickets.length,
                totalStoryPoints: totalSP,
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
