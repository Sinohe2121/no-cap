export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const imports = await prisma.payrollImport.findMany({
            select: { id: true, label: true, payDate: true, year: true },
            orderBy: { payDate: 'desc' },
        });

        return NextResponse.json(imports);
    } catch (error) {
        console.error('Payroll periods error:', error);
        return NextResponse.json({ error: 'Failed to load periods' }, { status: 500 });
    }
}
