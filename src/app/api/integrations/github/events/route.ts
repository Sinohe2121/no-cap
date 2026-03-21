import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET — list GitHubEvents with optional ?classification= filter
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const classification = searchParams.get('classification');
        const page = parseInt(searchParams.get('page') || '1', 10);
        const perPage = 50;

        const where = classification && classification !== 'ALL'
            ? { classification }
            : {};

        const [events, total] = await Promise.all([
            prisma.gitHubEvent.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            prisma.gitHubEvent.count({ where }),
        ]);

        // Classification summary counts
        const summary = await prisma.gitHubEvent.groupBy({
            by: ['classification'],
            _count: { _all: true },
        });

        return NextResponse.json({ events, total, page, perPage, summary });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
    }
}
