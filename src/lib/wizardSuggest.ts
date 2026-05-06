/**
 * Shared suggestion logic for the Next Period Wizard.
 *
 * Used by both WizardContext (to keep the cached period fresh as soon as the
 * app mounts, even when the wizard is closed) and Step1Payroll (to surface
 * gaps and re-derive when the user navigates back into Step 1).
 */

import { formatPeriodLabel } from '@/lib/periodLabel';

export interface PayrollPeriodRef {
    id: string;
    label: string;
    payDate: string;
    year: number;
}

export interface AccountingPeriodRef {
    id: string;
    month: number; // 1-12
    year: number;
    journalEntries: { id: string }[];
}

export interface SuggestedPeriod {
    month: number;
    year: number;
    label: string;
}

function payDateToMonthYear(payDate: string): { month: number; year: number } {
    const parts = String(payDate).split('T')[0].split('-');
    return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) };
}

/** Periods with payroll imported but no journal entries generated. */
export function findGapPeriods(
    imports: PayrollPeriodRef[],
    accountingPeriods: AccountingPeriodRef[],
): SuggestedPeriod[] {
    const periodsWithEntries = new Set(
        accountingPeriods
            .filter(p => Array.isArray(p.journalEntries) && p.journalEntries.length > 0)
            .map(p => `${p.year}-${p.month}`)
    );
    return [...imports]
        .sort((a, b) => (a.payDate < b.payDate ? -1 : 1))
        .map(imp => payDateToMonthYear(imp.payDate))
        .filter(({ month, year }) => !periodsWithEntries.has(`${year}-${month}`))
        .map(({ month, year }) => ({ month, year, label: formatPeriodLabel(month, year) }));
}

/**
 * Suggest which period the user should work on next:
 *   1. Catch-up: earliest payroll period that doesn't yet have journal entries.
 *   2. Otherwise: the month after the latest payroll import.
 *   3. If no payroll exists at all: the current calendar month.
 */
export function suggestNextPeriod(
    imports: PayrollPeriodRef[],
    accountingPeriods: AccountingPeriodRef[],
): SuggestedPeriod {
    const gaps = findGapPeriods(imports, accountingPeriods);
    if (gaps.length > 0) return gaps[0];

    if (imports.length > 0) {
        const latest = [...imports].sort((a, b) => (a.payDate < b.payDate ? 1 : -1))[0];
        const { month: m, year: y } = payDateToMonthYear(latest.payDate);
        const nextMonth = m === 12 ? 1 : m + 1;
        const nextYear = m === 12 ? y + 1 : y;
        return { month: nextMonth, year: nextYear, label: formatPeriodLabel(nextMonth, nextYear) };
    }

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return { month, year, label: formatPeriodLabel(month, year) };
}

/**
 * Fetch periods from the API and return the suggested next period in one call.
 * Returns null if the fetches fail (so callers can leave state untouched).
 */
export async function fetchAndSuggest(): Promise<{
    suggestion: SuggestedPeriod;
    imports: PayrollPeriodRef[];
    accountingPeriods: AccountingPeriodRef[];
} | null> {
    try {
        const [impRes, apRes] = await Promise.all([
            fetch('/api/payroll-register/periods'),
            fetch('/api/accounting'),
        ]);
        const impData = impRes.ok ? await impRes.json() : [];
        const apData = apRes.ok ? await apRes.json() : [];
        const imports: PayrollPeriodRef[] = Array.isArray(impData) ? impData : [];
        const accountingPeriods: AccountingPeriodRef[] = Array.isArray(apData) ? apData : [];
        return {
            suggestion: suggestNextPeriod(imports, accountingPeriods),
            imports,
            accountingPeriods,
        };
    } catch {
        return null;
    }
}
