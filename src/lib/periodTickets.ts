// "Active in period" derivation for JiraTicket.
//
// importPeriod is FIRST-SEEN — the period the ticket was first imported. It
// is set on insert and never overwritten on re-encounter. resolutionDate is
// CURRENT STATE — refreshed every time we re-encounter the ticket from Jira.
//
// A ticket belongs to period N's cost-allocation pool iff BOTH:
//   1. it had been imported by N: importPeriod ≤ N (chronological on label), AND
//   2. it had not closed before N started: resolutionDate IS NULL OR resolutionDate >= startOfN.
//
// This single predicate replaces the old "where importPeriod === label" filter
// in cost-allocation paths so carry-forwards stay in scope across periods.

import { MONTH_NAMES, formatPeriodLabel } from './periodLabel';

export interface ParsedPeriod {
    year: number;
    month: number; // 1-12
}

/** Parse "March 2026" → { year: 2026, month: 3 }. Returns null on malformed input. */
export function parsePeriodLabel(label: string): ParsedPeriod | null {
    const match = label.match(/^(\w+)\s+(\d{4})$/);
    if (!match) return null;
    const monthIdx = MONTH_NAMES.findIndex(m => m === match[1]);
    if (monthIdx < 0) return null;
    const year = parseInt(match[2], 10);
    if (!Number.isFinite(year)) return null;
    return { year, month: monthIdx + 1 };
}

/** First day of the month, 00:00 local — used as "start of period N". */
export function startOfPeriod(label: string): Date | null {
    const p = parsePeriodLabel(label);
    if (!p) return null;
    return new Date(p.year, p.month - 1, 1);
}

/** Last instant of the month — used as "end of period N". */
export function endOfPeriod(label: string): Date | null {
    const p = parsePeriodLabel(label);
    if (!p) return null;
    return new Date(p.year, p.month, 0, 23, 59, 59, 999);
}

/**
 * Enumerate every period label from (targetYear − lookbackYears) Jan through
 * the target month/year inclusive. The default 10-year lookback comfortably
 * covers any backfilled history; trim if perf becomes a concern.
 */
export function periodLabelsThrough(
    targetYear: number,
    targetMonth: number,
    lookbackYears = 10,
): string[] {
    const labels: string[] = [];
    const startYear = targetYear - lookbackYears;
    for (let y = startYear; y <= targetYear; y++) {
        const monthCap = y === targetYear ? targetMonth : 12;
        for (let m = 1; m <= monthCap; m++) {
            labels.push(formatPeriodLabel(m, y));
        }
    }
    return labels;
}

/**
 * Where-clause snippet for "tickets active in period {label}".
 *
 * Spread into a Prisma findMany to filter to (a) tickets first imported on
 * or before this period AND (b) not resolved before the period started:
 *
 *   prisma.jiraTicket.findMany({ where: { ...activeInPeriodWhere(label), assigneeId: ... } })
 *
 * Falls back to the old single-period match if the label doesn't parse, so
 * malformed labels degrade safely instead of silently widening the pool.
 */
export function activeInPeriodWhere(label: string) {
    const parsed = parsePeriodLabel(label);
    if (!parsed) return { importPeriod: label };
    const start = new Date(parsed.year, parsed.month - 1, 1);
    return {
        importPeriod: { in: periodLabelsThrough(parsed.year, parsed.month) },
        OR: [
            { resolutionDate: null },
            { resolutionDate: { gte: start } },
        ],
    };
}

/**
 * In-memory predicate matching activeInPeriodWhere. Use when you've already
 * fetched a ticket set and need to filter per-period in the application
 * layer (e.g. dashboard's per-period loop over a single fetched ticket list).
 */
export function isTicketActiveInPeriod(
    ticket: { importPeriod: string | null; resolutionDate: Date | null },
    label: string,
): boolean {
    if (!ticket.importPeriod) return false;
    const target = parsePeriodLabel(label);
    const ticketP = parsePeriodLabel(ticket.importPeriod);
    // Fallback to legacy single-period match if either label is malformed
    if (!target || !ticketP) return ticket.importPeriod === label;
    // (1) imported on or before target period
    if (ticketP.year > target.year) return false;
    if (ticketP.year === target.year && ticketP.month > target.month) return false;
    // (2) not resolved before target period starts
    if (!ticket.resolutionDate) return true;
    const startOfTarget = new Date(target.year, target.month - 1, 1);
    return ticket.resolutionDate >= startOfTarget;
}

/**
 * Where-clause for tickets the system EXPECTS to see as carry-forwards in
 * the next period — i.e. tickets that were active at end of {label}. Used
 * to compute the audit-A discrepancy: what we expected vs what Jira returned.
 */
export function expectedCarryForwardsWhere(priorLabel: string) {
    return activeInPeriodWhere(priorLabel);
}
