import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { data } = body; // Array of { name, email, monthlySalary, stockCompAllocation }

        if (!Array.isArray(data) || data.length === 0) {
            return NextResponse.json({ error: 'No data provided' }, { status: 400 });
        }

        let updated = 0;
        for (const row of data) {
            if (!row.email) continue;
            try {
                await prisma.developer.update({
                    where: { email: row.email },
                    data: {
                        ...(row.monthlySalary && { monthlySalary: parseFloat(row.monthlySalary) }),
                        ...(row.stockCompAllocation && { stockCompAllocation: parseFloat(row.stockCompAllocation) }),
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
