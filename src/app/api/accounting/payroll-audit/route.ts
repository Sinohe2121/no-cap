import { NextResponse } from 'next/server';
import { calculatePeriodCosts } from '@/lib/calculations';
import prisma from '@/lib/prisma';

/**
 * GET /api/accounting/payroll-audit?month=2&year=2026
 *
 * Returns per-developer breakdown of capitalized vs expensed salary
 * along with their total payroll (loaded cost) and delta.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const month = parseInt(searchParams.get('month') || '0', 10);
        const year = parseInt(searchParams.get('year') || '0', 10);

        if (!month || !year) {
            return NextResponse.json(
                { error: 'month and year query parameters are required' },
                { status: 400 },
            );
        }

        // Re-calculate developer costs for this period
        const costResults = await calculatePeriodCosts(month, year);

        // Also try to fetch payroll register data for this period (optional)
        const payrollByDev: Record<string, number> = {};
        try {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payrollImports = await (prisma as any).payrollImport?.findMany({
                where: {
                    payDate: { gte: startDate, lte: endDate },
                },
                include: {
                    entries: {
                        select: { developerId: true, grossSalary: true },
                    },
                },
            });

            if (payrollImports) {
                for (const imp of payrollImports) {
                    for (const entry of imp.entries) {
                        payrollByDev[entry.developerId] =
                            (payrollByDev[entry.developerId] || 0) + entry.grossSalary;
                    }
                }
            }
        } catch {
            // PayrollImport model may not exist — that's fine
        }

        interface DevRow {
            name: string;
            capitalized: number;
            expensed: number;
            total: number;
            totalPayroll: number;
            delta: number;
        }

        const developers: DevRow[] = costResults.map((r) => {
            const total = r.capitalizedAmount + r.expensedAmount;
            const totalPayroll = r.loadedCost; // fully-loaded monthly cost
            return {
                name: r.developerName,
                capitalized: r.capitalizedAmount,
                expensed: r.expensedAmount,
                total,
                totalPayroll,
                delta: total - totalPayroll,
            };
        });

        // Sort alphabetically
        developers.sort((a, b) => a.name.localeCompare(b.name));

        // Totals row
        const totals: Omit<DevRow, 'name'> = {
            capitalized: developers.reduce((s, d) => s + d.capitalized, 0),
            expensed: developers.reduce((s, d) => s + d.expensed, 0),
            total: developers.reduce((s, d) => s + d.total, 0),
            totalPayroll: developers.reduce((s, d) => s + d.totalPayroll, 0),
            delta: developers.reduce((s, d) => s + d.delta, 0),
        };

        return NextResponse.json({ developers, totals, month, year });
    } catch (error) {
        console.error('Payroll audit error:', error);
        return NextResponse.json(
            { error: 'Failed to load payroll audit' },
            { status: 500 },
        );
    }
}
