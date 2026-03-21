import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Returns all accounting periods that have journal entries,
 * sorted chronologically. Used by the Roll-Forward period selector.
 */
export async function GET() {
    try {
        // Get all periods that have at least one journal entry
        const periods = await prisma.accountingPeriod.findMany({
            where: {
                journalEntries: { some: {} },
            },
            select: { id: true, month: true, year: true, status: true },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
        });

        return NextResponse.json(periods);
    } catch (error) {
        console.error('List periods error:', error);
        return NextResponse.json([], { status: 500 });
    }
}
