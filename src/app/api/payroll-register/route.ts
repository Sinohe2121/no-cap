import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface EntryRow {
    developerId: string;
    grossSalary: number;
    sbcAmount: number;
}

interface ImportWithEntries {
    id: string;
    label: string;
    payDate: Date;
    year: number;
    fringeBenefitRate: number;
    createdAt: Date;
    entries: EntryRow[];
}

interface DevRow {
    id: string;
    name: string;
    email: string;
    role: string;
}

export async function GET() {
    try {
        const developers: DevRow[] = await prisma.developer.findMany({
            where: { isActive: true },
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: 'asc' },
        });

        const payrollImports: ImportWithEntries[] = await prisma.payrollImport.findMany({
            orderBy: { payDate: 'asc' },
            include: {
                entries: { select: { developerId: true, grossSalary: true, sbcAmount: true } },
            },
        });

        // dev → { importId → totalCost (salary + fringe + sbc) }
        const costMap: Record<string, Record<string, number>> = {};
        for (const dev of developers) {
            costMap[dev.id] = {};
        }

        for (const imp of payrollImports) {
            const rate = imp.fringeBenefitRate ?? 0;
            for (const entry of imp.entries) {
                if (costMap[entry.developerId]) {
                    const totalCost = entry.grossSalary + (entry.grossSalary * rate) + (entry.sbcAmount || 0);
                    costMap[entry.developerId][imp.id] = totalCost;
                }
            }
        }

        // Column totals
        const importTotals: Record<string, number> = {};
        for (const imp of payrollImports) {
            const rate = imp.fringeBenefitRate ?? 0;
            importTotals[imp.id] = imp.entries.reduce((s: number, e: EntryRow) => {
                return s + e.grossSalary + (e.grossSalary * rate) + (e.sbcAmount || 0);
            }, 0);
        }

        // Row totals
        const devTotals: Record<string, number> = {};
        for (const dev of developers) {
            devTotals[dev.id] = Object.values(costMap[dev.id]).reduce((s, v) => s + v, 0);
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
            salaryMap: costMap,
            importTotals,
            devTotals,
            grandTotal,
            yearLabel,
        });
    } catch (error) {
        console.error('Payroll register error:', error);
        return NextResponse.json({ error: 'Failed to load payroll register' }, { status: 500 });
    }
}
