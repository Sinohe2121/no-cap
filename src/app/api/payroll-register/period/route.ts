export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }

        const payrollImport = await prisma.payrollImport.findUnique({
            where: { id },
            include: {
                entries: {
                    select: { developerId: true, grossSalary: true, sbcAmount: true },
                    orderBy: { developer: { name: 'asc' } },
                },
            },
        });

        if (!payrollImport) {
            return NextResponse.json({ error: 'Period not found' }, { status: 404 });
        }

        return NextResponse.json({
            id: payrollImport.id,
            label: payrollImport.label,
            payDate: payrollImport.payDate,
            year: payrollImport.year,
            fringeBenefitRate: payrollImport.fringeBenefitRate,
            meetingTimeRate: payrollImport.meetingTimeRate,
            entries: payrollImport.entries,
        });
    } catch (error) {
        console.error('Period detail error:', error);
        return NextResponse.json({ error: 'Failed to load period' }, { status: 500 });
    }
}
