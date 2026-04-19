export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';

async function isAdmin(request: Request) {
    const session = await getServerSession(authOptions);
    return session?.user?.role === 'ADMIN';
}

export async function GET() {
    try {
        const memos = await (prisma as any).policyMemo.findMany({
            orderBy: [{ year: 'desc' }, { category: 'asc' }, { updatedAt: 'desc' }],
            select: { id: true, title: true, category: true, year: true, createdAt: true, updatedAt: true },
        });
        return NextResponse.json({ memos });
    } catch (error) {
        return handleApiError(error, 'Failed to load memos');
    }
}

export async function POST(request: Request) {
    try {
        if (!(await isAdmin(request))) {
            return NextResponse.json({ error: 'Admin only' }, { status: 403 });
        }
        const { title, category, year, content } = await request.json();
        if (!title || !year) return NextResponse.json({ error: 'title and year are required' }, { status: 400 });

        const memo = await (prisma as any).policyMemo.create({
            data: {
                title,
                category: category || 'CAPITALIZATION',
                year: parseInt(String(year)),
                content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
            },
        });
        return NextResponse.json({ memo });
    } catch (error) {
        return handleApiError(error, 'Failed to create memo');
    }
}
