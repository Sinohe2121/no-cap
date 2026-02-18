import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const tickets = await prisma.jiraTicket.findMany({
            include: {
                assignee: { select: { id: true, name: true, role: true, isActive: true } },
                project: { select: { id: true, name: true, status: true, epicKey: true, isCapitalizable: true } },
                auditTrails: { select: { id: true, allocatedAmount: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const formatted = tickets.map((t: typeof tickets[number]) => ({
            id: t.id,
            ticketId: t.ticketId,
            epicKey: t.epicKey,
            issueType: t.issueType,
            summary: t.summary,
            storyPoints: t.storyPoints,
            resolutionDate: t.resolutionDate,
            fixVersion: t.fixVersion,
            createdAt: t.createdAt,
            assignee: t.assignee,
            project: t.project,
            allocatedCost: t.auditTrails.reduce((sum: number, a: { allocatedAmount: number }) => sum + a.allocatedAmount, 0),
        }));

        return NextResponse.json(formatted);
    } catch (error) {
        console.error('Tickets API error:', error);
        return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 });
    }
}
