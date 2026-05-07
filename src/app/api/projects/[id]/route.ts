export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                tickets: {
                    select: {
                        id: true,
                        ticketId: true,
                        issueType: true,
                        summary: true,
                        storyPoints: true,
                        resolutionDate: true,
                        // createdAt + customFields fuel the per-engineer activity
                        // heatmap on the Reports asset drawer. Jira "Created"
                        // (when present in customFields) is preferred over the
                        // DB row's createdAt because the latter is the import
                        // timestamp, not the work timestamp.
                        createdAt: true,
                        customFields: true,
                        assigneeId: true,
                        assignee: { select: { id: true, name: true, role: true } },
                    },
                    orderBy: { resolutionDate: 'desc' },
                },
                journalEntries: {
                    select: {
                        id: true,
                        entryType: true,
                        debitAccount: true,
                        creditAccount: true,
                        amount: true,
                        description: true,
                        period: { select: { month: true, year: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Calculate developer contribution from the tickets we already loaded — no second query needed
        const byDev = new Map<string, { id: string; name: string; role: string; ticketCount: number; totalPoints: number; storyPoints: number }>();
        for (const t of project.tickets) {
            if (!t.assignee) continue;
            const acc = byDev.get(t.assignee.id) ?? {
                id: t.assignee.id,
                name: t.assignee.name,
                role: t.assignee.role,
                ticketCount: 0,
                totalPoints: 0,
                storyPoints: 0,
            };
            acc.ticketCount += 1;
            acc.totalPoints += t.storyPoints;
            if (t.issueType === 'STORY') acc.storyPoints += t.storyPoints;
            byDev.set(t.assignee.id, acc);
        }
        const devContributions = Array.from(byDev.values());

        return NextResponse.json({
            ...project,
            developers: devContributions,
        });
    } catch (error) {
        console.error('Project detail error:', error);
        return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
    }
}
