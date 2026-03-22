export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Global search across projects, tickets, developers.
 * ?q=search_term
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q')?.trim();

        if (!q || q.length < 2) {
            return NextResponse.json({ results: [] });
        }

        const [projects, developers, tickets] = await Promise.all([
            prisma.project.findMany({
                where: { name: { contains: q, mode: 'insensitive' } },
                select: { id: true, name: true, isCapitalizable: true },
                take: 5,
            }),
            prisma.developer.findMany({
                where: {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { email: { contains: q, mode: 'insensitive' } },
                    ],
                },
                select: { id: true, name: true, role: true },
                take: 5,
            }),
            prisma.jiraTicket.findMany({
                where: {
                    OR: [
                        { summary: { contains: q, mode: 'insensitive' } },
                        { ticketId: { contains: q, mode: 'insensitive' } },
                    ],
                },
                select: { id: true, ticketId: true, summary: true, projectId: true },
                take: 5,
            }),
        ]);

        const results = [
            ...projects.map(p => ({
                type: 'project' as const,
                id: p.id,
                title: p.name,
                subtitle: p.isCapitalizable ? 'Capitalizable' : 'Non-capitalizable',
                href: `/projects/${p.id}`,
            })),
            ...developers.map(d => ({
                type: 'developer' as const,
                id: d.id,
                title: d.name,
                subtitle: d.role || 'Developer',
                href: `/developers/${d.id}`,
            })),
            ...tickets.map(t => ({
                type: 'ticket' as const,
                id: t.id,
                title: t.ticketId,
                subtitle: t.summary.length > 60 ? t.summary.slice(0, 60) + '…' : t.summary,
                href: t.projectId ? `/projects/${t.projectId}/tickets` : '/projects',
            })),
        ];

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Search error:', error);
        return NextResponse.json({ results: [] });
    }
}
