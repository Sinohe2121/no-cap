export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * GET /api/projects/[id]/audit-trail
 * Returns all journal entries for a specific project across all periods.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const auth = await requireAuth(request);
        if (auth instanceof NextResponse) return auth;

        const entries = await prisma.journalEntry.findMany({
            where: { projectId: params.id },
            include: {
                period: { select: { month: true, year: true, status: true } },
            },
            orderBy: [
                { period: { year: 'desc' } },
                { period: { month: 'desc' } },
                { createdAt: 'desc' },
            ],
        });

        return NextResponse.json({
            entries: entries.map(e => ({
                id: e.id,
                entryType: e.entryType,
                debitAccount: e.debitAccount,
                creditAccount: e.creditAccount,
                amount: e.amount,
                description: e.description,
                period: { month: e.period.month, year: e.period.year },
            })),
        });
    } catch (error) {
        console.error('Project audit trail error:', error);
        return NextResponse.json({ error: 'Failed to fetch audit trail' }, { status: 500 });
    }
}
