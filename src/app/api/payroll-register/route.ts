import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface EntryRow {
    developerId: string;
    grossSalary: number;
}

interface ImportWithEntries {
    id: string;
    label: string;
    payDate: Date;
    year: number;
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
                entries: { select: { developerId: true, grossSalary: true } },
            },
        });

        // dev → { importId → gross }
        const salaryMap: Record<string, Record<string, number>> = {};
        for (const dev of developers) {
            salaryMap[dev.id] = {};
        }

        for (const imp of payrollImports) {
            for (const entry of imp.entries) {
                if (salaryMap[entry.developerId]) {
                    salaryMap[entry.developerId][imp.id] = entry.grossSalary;
                }
            }
        }

        // Column totals
        const importTotals: Record<string, number> = {};
        for (const imp of payrollImports) {
            importTotals[imp.id] = imp.entries.reduce((s: number, e: EntryRow) => s + e.grossSalary, 0);
        }

        // Row totals
        const devTotals: Record<string, number> = {};
        for (const dev of developers) {
            devTotals[dev.id] = Object.values(salaryMap[dev.id]).reduce((s, v) => s + v, 0);
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
            salaryMap,
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
