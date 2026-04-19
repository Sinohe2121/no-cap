export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const body = await request.json();
        const { vendor, description, amount, qrePct, period, year } = body;

        const entry = await prisma.contractResearch.update({
            where: { id: params.id },
            data: {
                ...(vendor != null && { vendor }),
                ...(description !== undefined && { description }),
                ...(amount != null && { amount: parseFloat(String(amount)) }),
                ...(qrePct != null && { qrePct: parseFloat(String(qrePct)) }),
                ...(period != null && { period }),
                ...(year != null && { year: parseInt(String(year)) }),
            },
        });

        return NextResponse.json({ entry });
    } catch (error) {
        return handleApiError(error, 'Failed to update contract research entry');
    }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        await prisma.contractResearch.delete({ where: { id: params.id } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        return handleApiError(error, 'Failed to delete contract research entry');
    }
}
