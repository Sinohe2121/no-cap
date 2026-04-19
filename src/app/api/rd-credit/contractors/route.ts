export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const { searchParams } = new URL(request.url);
        const year = searchParams.get('year');

        const entries = await prisma.contractResearch.findMany({
            where: year ? { year: parseInt(year) } : undefined,
            orderBy: [{ year: 'desc' }, { period: 'asc' }],
        });

        return NextResponse.json({ entries });
    } catch (error) {
        return handleApiError(error, 'Failed to load contract research entries');
    }
}

export async function POST(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const body = await request.json();
        const { vendor, description, amount, qrePct, period, year } = body;

        if (!vendor || !amount || !period || !year) {
            return NextResponse.json({ error: 'vendor, amount, period, and year are required' }, { status: 400 });
        }

        const entry = await prisma.contractResearch.create({
            data: {
                vendor,
                description: description || null,
                amount: parseFloat(String(amount)),
                qrePct: qrePct != null ? parseFloat(String(qrePct)) : 0.65,
                period,
                year: parseInt(String(year)),
            },
        });

        return NextResponse.json({ entry });
    } catch (error) {
        return handleApiError(error, 'Failed to create contract research entry');
    }
}
