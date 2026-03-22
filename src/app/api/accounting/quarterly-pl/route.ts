export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ENTRY_TYPES } from '@/lib/constants';

/**
 * Returns quarterly P&L impact data:
 * - R&D Expense (expensed labor) per quarter
 * - Amortization Expense per quarter
 * - Total P&L Charge = R&D + Amortization
 * - Capitalized (removed from P&L) per quarter
 * - "Without Cap" scenario = total labor cost hitting P&L if nothing was capitalized
 * - P&L Benefit = how much capitalization saved each quarter
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');

        // Get all periods with journal entries
        const periods = await prisma.accountingPeriod.findMany({
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
            include: {
                journalEntries: {
                    select: {
                        entryType: true,
                        debitAccount: true,
                        creditAccount: true,
                        amount: true,
                    },
                },
            },
        });

        // Optionally filter by date range
        const filteredPeriods = periods.filter(p => {
            if (!startParam || !endParam) return true;
            const periodDate = new Date(p.year, p.month - 1, 1);
            const start = new Date(startParam + 'T00:00:00');
            const end = new Date(endParam + 'T23:59:59');
            return periodDate >= start && periodDate <= end;
        });

        // Aggregate into quarters
        const quarterMap: Record<string, {
            label: string;
            rdExpense: number;
            amortExpense: number;
            capitalized: number;
        }> = {};

        for (const period of filteredPeriods) {
            const q = Math.ceil(period.month / 3);
            const key = `${period.year}-Q${q}`;
            const label = `Q${q} ${period.year}`;

            if (!quarterMap[key]) {
                quarterMap[key] = { label, rdExpense: 0, amortExpense: 0, capitalized: 0 };
            }

            for (const je of period.journalEntries) {
                if (je.entryType === ENTRY_TYPES.EXPENSE) {
                    // R&D expense hitting P&L
                    quarterMap[key].rdExpense += je.amount;
                } else if (je.entryType === ENTRY_TYPES.AMORTIZATION) {
                    // Amortization expense hitting P&L
                    quarterMap[key].amortExpense += je.amount;
                } else if (je.entryType === ENTRY_TYPES.CAPITALIZATION) {
                    // Removed from P&L (deferred to balance sheet)
                    quarterMap[key].capitalized += je.amount;
                }
            }
        }

        // Build array sorted chronologically
        const quarters = Object.entries(quarterMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([_, q]) => ({
                label: q.label,
                rdExpense: Math.round(q.rdExpense),
                amortExpense: Math.round(q.amortExpense),
                totalPLCharge: Math.round(q.rdExpense + q.amortExpense),
                capitalized: Math.round(q.capitalized),
                withoutCap: Math.round(q.rdExpense + q.amortExpense + q.capitalized),
                plBenefit: Math.round(q.capitalized), // deferred from P&L
            }));

        // Totals
        const totals = quarters.reduce(
            (acc, q) => ({
                rdExpense: acc.rdExpense + q.rdExpense,
                amortExpense: acc.amortExpense + q.amortExpense,
                totalPLCharge: acc.totalPLCharge + q.totalPLCharge,
                capitalized: acc.capitalized + q.capitalized,
                withoutCap: acc.withoutCap + q.withoutCap,
                plBenefit: acc.plBenefit + q.plBenefit,
            }),
            { rdExpense: 0, amortExpense: 0, totalPLCharge: 0, capitalized: 0, withoutCap: 0, plBenefit: 0 }
        );

        return NextResponse.json({ quarters, totals });
    } catch (error) {
        console.error('Quarterly P&L error:', error);
        return NextResponse.json({ error: 'Failed to generate quarterly P&L impact' }, { status: 500 });
    }
}
