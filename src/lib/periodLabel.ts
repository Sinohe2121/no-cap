export const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// Canonical period label (e.g. "February 2026"). Used as the matching key
// between PayrollImport.label and JiraTicket.importPeriod — both sides MUST
// build labels through this helper or cost allocation will miss tickets.
export function formatPeriodLabel(month: number, year: number): string {
    return `${MONTH_NAMES[month - 1]} ${year}`;
}
