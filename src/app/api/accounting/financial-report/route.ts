export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/accounting/financial-report
 *
 * Returns a financial statement structure for capitalization accounting.
 * Accounts on rows, months on columns.
 *
 * Balance-sheet accounts (cumulative as-of end of period):
 *   - Software Asset (WIP / Capitalized)
 *   - Accumulated Amortization
 *   - Net Book Value
 *
 * P&L accounts (period activity only):
 *   - Capitalization (credit to payroll, DR to software asset)
 *   - R&D Expense (expensed labor)
 *   - Amortization Expense
 *
 * Query params: start=YYYY-MM-DD, end=YYYY-MM-DD
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');

        // Parse date range — fall back to all periods if not provided
        const filterStart = startParam ? new Date(startParam + 'T00:00:00') : new Date('2000-01-01');
        const filterEnd = endParam ? new Date(endParam + 'T23:59:59') : new Date('2100-12-31');

        // Pull all accounting periods with their journal entries, ordered chronologically
        const allPeriods = await prisma.accountingPeriod.findMany({
            include: { journalEntries: true },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
        });

        // Filter periods that fall within the selected range
        const periods = allPeriods.filter((p) => {
            const periodDate = new Date(p.year, p.month - 1, 1);
            return periodDate >= filterStart && periodDate <= filterEnd;
        });

        // Helper: compute live totals from actual journal entry rows.
        // The stored `totalCapitalized / totalExpensed / totalAmortization` columns on
        // AccountingPeriod are only written when entries are (re-)generated via POST.
        // If they were never updated (or the seed left them as 0) the widget shows zeros
        // even though JournalEntry rows exist — so we always derive fresh values here.
        const liveCap   = (p: typeof allPeriods[0]) =>
            p.journalEntries.filter(e => e.entryType === 'CAPITALIZATION').reduce((s, e) => s + e.amount, 0);
        const liveExp   = (p: typeof allPeriods[0]) =>
            p.journalEntries.filter(e => ['EXPENSE', 'EXPENSE_BUG', 'EXPENSE_TASK'].includes(e.entryType)).reduce((s, e) => s + e.amount, 0);
        const liveAmort = (p: typeof allPeriods[0]) =>
            p.journalEntries.filter(e => e.entryType === 'AMORTIZATION').reduce((s, e) => s + e.amount, 0);

        // Build running cumulative totals across ALL periods (for balance-sheet accounts)
        // We need balances from all historical periods up to and including each filtered period
        const colHeaders: string[] = []; // "Jan 2026" etc.

        // P&L: period-only values (live from journal entries)
        const plCapitalization: (number | null)[] = [];
        const plExpense: (number | null)[] = [];
        const plAmortization: (number | null)[] = [];

        // Balance sheet: we need cumulative sums up to each period
        // Build a map of cumulative values for each period from the full history
        type CumulativeRow = { cap: number; accAmort: number };
        const cumulativeByPeriod = new Map<string, CumulativeRow>();
        let runCap = 0;
        let runAccAmort = 0;
        for (const p of allPeriods) {
            runCap    += liveCap(p);
            runAccAmort += liveAmort(p);
            cumulativeByPeriod.set(`${p.year}-${p.month}`, { cap: runCap, accAmort: runAccAmort });
        }

        // Build columns
        for (const period of periods) {
            const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            colHeaders.push(`${MONTH_ABBR[period.month - 1]} ${period.year}`);

            plCapitalization.push(liveCap(period));
            plExpense.push(liveExp(period));
            plAmortization.push(liveAmort(period));
        }

        // Build balance-sheet rows (cumulative as of end of each period)
        const bsSoftwareAsset: (number | null)[] = [];
        const bsAccumAmort: (number | null)[] = [];
        const bsNetBookValue: (number | null)[] = [];

        for (const period of periods) {
            const cum = cumulativeByPeriod.get(`${period.year}-${period.month}`);
            const cap = cum?.cap ?? 0;
            const accAmort = cum?.accAmort ?? 0;
            bsSoftwareAsset.push(cap);
            bsAccumAmort.push(accAmort);
            bsNetBookValue.push(cap - accAmort);
        }

        // Column totals (for P&L)
        const totalCap = plCapitalization.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0;
        const totalExp = plExpense.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0;
        const totalAmort = plAmortization.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0;

        // Last period balance-sheet values for the "Total" column
        const lastCap = bsSoftwareAsset[bsSoftwareAsset.length - 1] ?? 0;
        const lastAccAmort = bsAccumAmort[bsAccumAmort.length - 1] ?? 0;
        const lastNBV = bsNetBookValue[bsNetBookValue.length - 1] ?? 0;

        return NextResponse.json({
            columns: colHeaders,
            sections: [
                {
                    title: 'Balance Sheet',
                    subtitle: 'As of end of period',
                    type: 'balance_sheet',
                    rows: [
                        { account: 'Software Asset (WIP / Cap)', values: bsSoftwareAsset, total: lastCap, color: '#21944E' },
                        { account: 'Accumulated Amortization', values: bsAccumAmort.map(v => v !== null ? -v : null), total: -lastAccAmort, color: '#FA4338' },
                        { account: 'Net Book Value', values: bsNetBookValue, total: lastNBV, color: '#4141A2', bold: true },
                    ],
                },
                {
                    title: 'Profit & Loss',
                    subtitle: 'Period activity only',
                    type: 'pl',
                    rows: [
                        { account: 'Capitalized Labor', values: plCapitalization, total: totalCap, color: '#21944E' },
                        { account: 'R&D Expense (Expensed Labor)', values: plExpense, total: totalExp, color: '#FA4338' },
                        { account: 'Amortization Expense', values: plAmortization, total: totalAmort, color: '#4141A2' },
                    ],
                },
            ],
        });
    } catch (error) {
        console.error('Financial report error:', error);
        return NextResponse.json({ error: 'Failed to load financial report' }, { status: 500 });
    }
}
