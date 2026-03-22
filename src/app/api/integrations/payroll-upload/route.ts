export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PayrollUploadSchema, formatZodError } from '@/lib/validations';

export async function POST(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = PayrollUploadSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { data } = parsed.data;

        let updated = 0;
        for (const row of data) {
            if (!row.email) continue;
            try {
                await prisma.developer.update({
                    where: { email: row.email },
                    data: {
                        ...(row.monthlySalary && { monthlySalary: row.monthlySalary }),
                        ...(row.stockCompAllocation && { stockCompAllocation: row.stockCompAllocation }),
                        ...(row.name && { name: row.name }),
                    },
                });
                updated++;
            } catch {
                // Developer not found, skip
            }
        }

        return NextResponse.json({ message: `Updated ${updated} developers`, count: updated });
    } catch (error) {
        console.error('Payroll upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
