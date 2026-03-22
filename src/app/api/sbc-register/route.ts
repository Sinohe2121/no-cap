export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface DevRow {
    id: string;
    name: string;
    email: string;
    role: string;
    stockCompAllocation: number;
}

interface ImportRef {
    id: string;
    label: string;
    payDate: Date;
    year: number;
    createdAt: Date;
}

export async function GET() {
    try {
        const developers: DevRow[] = await prisma.developer.findMany({
            where: { isActive: true },
            select: { id: true, name: true, email: true, role: true, stockCompAllocation: true },
            orderBy: { name: 'asc' },
        });

        const payrollImports: ImportRef[] = await prisma.payrollImport.findMany({
            orderBy: { payDate: 'asc' },
        });

        // dev → { importId → stock_comp }
        const sbcMap: Record<string, Record<string, number>> = {};
        for (const dev of developers) {
            sbcMap[dev.id] = {};
            for (const imp of payrollImports) {
                sbcMap[dev.id][imp.id] = dev.stockCompAllocation;
            }
        }

        // Column totals (Sum of all active developer allocations for that vertical period)
        const importTotals: Record<string, number> = {};
        for (const imp of payrollImports) {
            importTotals[imp.id] = developers.reduce((s: number, dev: DevRow) => s + dev.stockCompAllocation, 0);
        }

        // Row totals (Sum of that developer's constant allocations across all available horizontal periods)
        const devTotals: Record<string, number> = {};
        for (const dev of developers) {
            devTotals[dev.id] = Object.values(sbcMap[dev.id]).reduce((s, v) => s + v, 0);
        }

        const grandTotal = Object.values(devTotals).reduce((s, v) => s + v, 0);

        const years = Array.from(new Set(payrollImports.map((p) => p.year)));
        const yearLabel = years.length === 1 ? `Total ${years[0]}` : 'Grand Total';

        return NextResponse.json({
            developers,
            payrollImports: payrollImports.map((p) => ({
                id: p.id,
                label: p.label,
                payDate: p.payDate,
                year: p.year,
            })),
            salaryMap: sbcMap,
            importTotals,
            devTotals,
            grandTotal,
            yearLabel,
        });
    } catch (error) {
        console.error('SBC register error:', error);
        return NextResponse.json({ error: 'Failed to load SBC register' }, { status: 500 });
    }
}
