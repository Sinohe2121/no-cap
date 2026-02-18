import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const configs = await prisma.globalConfig.findMany({ orderBy: { key: 'asc' } });
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ configs, users });
    } catch (error) {
        console.error('Admin API error:', error);
        return NextResponse.json({ error: 'Failed to load admin data' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { type, ...data } = body;

        if (type === 'config') {
            await prisma.globalConfig.update({
                where: { key: data.key },
                data: { value: data.value },
            });
        } else if (type === 'user_role') {
            await prisma.user.update({
                where: { id: data.id },
                data: { role: data.role },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Admin update error:', error);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
