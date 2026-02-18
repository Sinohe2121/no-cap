import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const project = await prisma.project.findUnique({
            where: { id: params.id },
            include: {
                tickets: {
                    include: { assignee: true },
                    orderBy: { resolutionDate: 'desc' },
                },
                journalEntries: {
                    include: { period: true },
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Get unique developers for this project
        const devIds = [...new Set(project.tickets.map((t) => t.assigneeId))];
        const developers = await prisma.developer.findMany({
            where: { id: { in: devIds } },
        });

        // Calculate developer contribution
        const devContributions = developers.map((dev) => {
            const devTickets = project.tickets.filter((t) => t.assigneeId === dev.id);
            const totalPoints = devTickets.reduce((s, t) => s + t.storyPoints, 0);
            const storyPoints = devTickets.filter((t) => t.issueType === 'STORY').reduce((s, t) => s + t.storyPoints, 0);
            return {
                id: dev.id,
                name: dev.name,
                role: dev.role,
                ticketCount: devTickets.length,
                totalPoints,
                storyPoints,
            };
        });

        return NextResponse.json({
            ...project,
            developers: devContributions,
        });
    } catch (error) {
        console.error('Project detail error:', error);
        return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
    }
}
