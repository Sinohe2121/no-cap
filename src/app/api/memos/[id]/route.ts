export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    return session?.user?.role === 'ADMIN';
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    try {
        const memo = await (prisma as any).policyMemo.findUnique({ where: { id: params.id } });
        if (!memo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ memo });
    } catch (error) {
        return handleApiError(error, 'Failed to load memo');
    }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    try {
        if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
        const body = await request.json();
        const { title, category, year, content } = body;
        const memo = await (prisma as any).policyMemo.update({
            where: { id: params.id },
            data: {
                ...(title !== undefined && { title }),
                ...(category !== undefined && { category }),
                ...(year !== undefined && { year: parseInt(String(year)) }),
                ...(content !== undefined && { content }),
            },
        });
        return NextResponse.json({ memo });
    } catch (error) {
        return handleApiError(error, 'Failed to update memo');
    }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    try {
        if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
        await (prisma as any).policyMemo.delete({ where: { id: params.id } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        return handleApiError(error, 'Failed to delete memo');
    }
}
