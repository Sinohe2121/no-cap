export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { calculateAmortization, calculateTicketAmortization } from '@/lib/calculations';
import { loadClassificationRules, classifyTicket } from '@/lib/classification';

// ── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function esc(val: string | number | boolean | null | undefined): string {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function money(n: number): string {
    return n.toFixed(2);
}

function isoDate(d: Date | string | null): string {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toISOString().slice(0, 10);
}

function pad(cells: (string | number)[], width: number): string {
    const out = [...cells];
    while (out.length < width) out.push('');
    return out.join(',');
}

// ── Main Export ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
    try {
        const auth = await requireAuth(request);
        if (auth instanceof NextResponse) return auth;

        const { searchParams } = new URL(request.url);
        const month = parseInt(searchParams.get('month') || '0');
        const year = parseInt(searchParams.get('year') || '0');

        if (!month || !year || month < 1 || month > 12) {
            return NextResponse.json({ error: 'Valid month and year required' }, { status: 400 });
        }

        const periodStart = new Date(year, month - 1, 1);
        const periodEndDate = new Date(year, month, 0, 23, 59, 59);
        const asOfDate = new Date(year, month - 1, 15);

        // ── 1. Period + Journal Entries ──────────────────────────────────────

        const period = await prisma.accountingPeriod.findUnique({
            where: { month_year: { month, year } },
            include: {
                journalEntries: {
                    include: {
                        project: true,
                        auditTrails: {
                            include: { jiraTicket: true },
                            orderBy: { allocatedAmount: 'desc' },
                        },
                    },
                    orderBy: [{ entryType: 'asc' }, { createdAt: 'asc' }],
                },
            },
        });

        if (!period) {
            return NextResponse.json({ error: 'Period not found — generate journal entries first' }, { status: 404 });
        }

        // ── 2. Tickets worked during period (open + resolved-in-period) ─────

        const ticketsWorked = await prisma.jiraTicket.findMany({
            where: {
                OR: [
                    { resolutionDate: null },
                    { resolutionDate: { gte: periodStart, lte: periodEndDate } },
                ],
            },
            include: {
                project: { select: { id: true, name: true, isCapitalizable: true, status: true, epicKey: true } },
            },
            orderBy: [{ projectId: 'asc' }, { ticketId: 'asc' }],
        });

        // ── 3. Payroll for the period ───────────────────────────────────────

        const payrollImports = await prisma.payrollImport.findMany({
            where: {
                payDate: { gte: periodStart, lte: periodEndDate },
            },
            include: {
                entries: {
                    include: { developer: { select: { id: true, name: true, email: true } } },
                    orderBy: { developer: { name: 'asc' } },
                },
            },
            orderBy: { payDate: 'asc' },
        });

        // ── 4. Active projects (incl. ones being amortized) ─────────────────

        const projects = await prisma.project.findMany({
            where: {
                OR: [
                    { status: { in: ['DEV', 'LIVE'] } },
                    { accumulatedCost: { gt: 0 } },
                    { startingBalance: { gt: 0 } },
                ],
            },
            include: {
                amortOverrides: { orderBy: [{ year: 'asc' }, { month: 'asc' }] },
            },
            orderBy: { name: 'asc' },
        });

        // ── 5. Global config + classification rules ─────────────────────────

        const [fringeCfg, standardCfg, meetingCfg, bugSpCfg, otherSpCfg, rules] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
            prisma.globalConfig.findUnique({ where: { key: 'ACCOUNTING_STANDARD' } }),
            prisma.globalConfig.findUnique({ where: { key: 'MEETING_TIME_RATE' } }),
            prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
            prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
            loadClassificationRules(),
        ]);
        const fringeRate         = fringeCfg  ? parseFloat(fringeCfg.value)  : 0.25;
        const accountingStandard = standardCfg?.value || 'ASC_350_40';
        const meetingTimeRate    = meetingCfg ? parseFloat(meetingCfg.value) : 0;
        const bugSpFallback      = parseFloat(bugSpCfg?.value  ?? '1') || 1;
        const otherSpFallback    = parseFloat(otherSpCfg?.value ?? '1') || 1;

        // Amortizing tickets (those with allocatedAmount > 0 resolved before this period)
        const amortTicketsAll = await prisma.jiraTicket.findMany({
            where: {
                allocatedAmount: { gt: 0 },
                resolutionDate: { lt: periodStart },
            },
            include: { project: true },
        });
        // Re-classify under current rules — only those still classified as CAPITALIZE amortize
        const amortTickets = amortTicketsAll.filter(t =>
            classifyTicket(rules, t, t.project)
                === 'CAPITALIZE'
        );

        // ── Build CSV ───────────────────────────────────────────────────────

        const lines: string[] = [];
        const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
        const exportedAt = new Date().toISOString();

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 1 — Report Header
        // ─────────────────────────────────────────────────────────────────────
        lines.push(`═══ NO CAP — MASTER AUDIT EXPORT ═══`);
        lines.push(`Period,${monthLabel}`);
        lines.push(`Period Status,${period.status}`);
        lines.push(`Period Range,${isoDate(periodStart)} to ${isoDate(periodEndDate)}`);
        lines.push(`Exported At (UTC),${exportedAt}`);
        lines.push('');
        lines.push(`─── ACTIVE CONFIGURATION (used to generate this period) ───`);
        lines.push(`Accounting Standard,${accountingStandard}`);
        lines.push(`Fringe Benefit Rate,${(fringeRate * 100).toFixed(1)}%`);
        lines.push(`Meeting Time / Overhead Rate,${(meetingTimeRate * 100).toFixed(1)}%`);
        lines.push(`Story Point Fallback — Bugs,${bugSpFallback}`);
        lines.push(`Story Point Fallback — Other,${otherSpFallback}`);

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 2 — Period Summary
        // ─────────────────────────────────────────────────────────────────────
        const sumByType = (t: string) =>
            period.journalEntries.filter(e => e.entryType === t).reduce((s, e) => s + e.amount, 0);
        const sumExpense = period.journalEntries
            .filter(e => ['EXPENSE', 'EXPENSE_BUG', 'EXPENSE_TASK'].includes(e.entryType))
            .reduce((s, e) => s + e.amount, 0);
        const totalCapitalized   = sumByType('CAPITALIZATION');
        const totalExpensedBugs  = sumByType('EXPENSE_BUG');
        const totalExpensedTasks = sumByType('EXPENSE_TASK');
        const totalExpensedOther = sumByType('EXPENSE');
        const totalAdjustment    = sumByType('ADJUSTMENT');
        const totalAmortization  = sumByType('AMORTIZATION');
        const totalExpensed      = sumExpense;
        const grandTotal         = totalCapitalized + totalExpensed + totalAmortization + totalAdjustment;

        lines.push('');
        lines.push(`═══ PERIOD SUMMARY ═══`);
        lines.push('Bucket,Amount');
        lines.push(`Capitalization,${money(totalCapitalized)}`);
        lines.push(`Expense — Bugs,${money(totalExpensedBugs)}`);
        lines.push(`Expense — Tasks,${money(totalExpensedTasks)}`);
        lines.push(`Expense — Other,${money(totalExpensedOther)}`);
        lines.push(`Overhead / Meeting Adjustment,${money(totalAdjustment)}`);
        lines.push(`Amortization,${money(totalAmortization)}`);
        lines.push(`GRAND TOTAL,${money(grandTotal)}`);
        const capDenominator = totalCapitalized + totalExpensed;
        const capRate = capDenominator > 0 ? (totalCapitalized / capDenominator) * 100 : 0;
        lines.push(`Capitalization Rate,${capRate.toFixed(2)}%`);

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 3 — Tie-Out Reconciliation
        // ─────────────────────────────────────────────────────────────────────
        const grossPayroll = payrollImports.reduce(
            (s, pi) => s + pi.entries.reduce((ss, pe) => ss + pe.grossSalary, 0), 0
        );
        const fringePayroll = payrollImports.reduce(
            (s, pi) => s + pi.entries.reduce((ss, pe) => ss + pe.grossSalary * (pi.fringeBenefitRate ?? fringeRate), 0), 0
        );
        const sbcPayroll = payrollImports.reduce(
            (s, pi) => s + pi.entries.reduce((ss, pe) => ss + pe.sbcAmount, 0), 0
        );
        const fullyLoadedPayroll = grossPayroll + fringePayroll + sbcPayroll;

        const accountedForPayroll = totalCapitalized + totalExpensed + totalAdjustment;
        const payrollDelta = fullyLoadedPayroll - accountedForPayroll;

        const capJEAmount = totalCapitalized;
        const capAuditTrailAmount = period.journalEntries
            .filter(e => e.entryType === 'CAPITALIZATION')
            .reduce((s, e) => s + e.auditTrails.reduce((ss, t) => ss + t.allocatedAmount, 0), 0);
        const capTrailDelta = capJEAmount - capAuditTrailAmount;

        lines.push('');
        lines.push(`═══ TIE-OUT RECONCILIATION ═══`);
        lines.push('Check,Amount A,Amount B,Δ (A − B),Pass');
        lines.push([
            'Fully Loaded Payroll vs Cap + Exp + Adj',
            money(fullyLoadedPayroll),
            money(accountedForPayroll),
            money(payrollDelta),
            Math.abs(payrollDelta) < 1 ? 'PASS' : 'REVIEW',
        ].join(','));
        lines.push([
            'Capitalization JE total vs Audit Trail total',
            money(capJEAmount),
            money(capAuditTrailAmount),
            money(capTrailDelta),
            Math.abs(capTrailDelta) < 1 ? 'PASS' : 'REVIEW',
        ].join(','));

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 4 — Classification Rules Snapshot
        // ─────────────────────────────────────────────────────────────────────
        lines.push('');
        lines.push(`═══ CLASSIFICATION RULES SNAPSHOT (priority order, first match wins) ═══`);
        lines.push('Priority,Issue Type,Project Status,Capitalizable,Action');
        for (const r of rules) {
            lines.push([
                r.priority,
                r.issueType,
                r.projectStatus,
                r.projectCapitalizable === null ? 'Any'
                    : r.projectCapitalizable ? 'Yes' : 'No',
                r.action,
            ].join(','));
        }

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 5 — Journal Entries (subtotals by type + grand total)
        // ─────────────────────────────────────────────────────────────────────
        lines.push('');
        lines.push(`═══ JOURNAL ENTRIES (${period.journalEntries.length}) ═══`);
        const jeHeader = 'Entry Type,Project,Epic Key,Project Status,Debit Account,Credit Account,Amount,Mgmt Authorized,Probable to Complete,Tickets,Developers';
        lines.push(jeHeader);

        const entriesByType = new Map<string, typeof period.journalEntries>();
        for (const e of period.journalEntries) {
            const arr = entriesByType.get(e.entryType) ?? [];
            arr.push(e);
            entriesByType.set(e.entryType, arr);
        }
        const typeOrder = ['CAPITALIZATION', 'EXPENSE_BUG', 'EXPENSE_TASK', 'EXPENSE', 'ADJUSTMENT', 'AMORTIZATION'];
        for (const t of typeOrder) {
            const arr = entriesByType.get(t);
            if (!arr || arr.length === 0) continue;
            let typeSubtotal = 0;
            for (const entry of arr) {
                const devNames = new Set(entry.auditTrails.map(at => at.developerName));
                lines.push([
                    entry.entryType,
                    esc(entry.project?.name ?? 'Period Adjustment'),
                    entry.project?.epicKey ?? '',
                    entry.project?.status ?? '',
                    entry.debitAccount,
                    entry.creditAccount,
                    money(entry.amount),
                    entry.project ? (entry.project.mgmtAuthorized ? 'Yes' : 'No') : 'N/A',
                    entry.project ? (entry.project.probableToComplete ? 'Yes' : 'No') : 'N/A',
                    entry.auditTrails.length,
                    devNames.size,
                ].join(','));
                typeSubtotal += entry.amount;
            }
            lines.push(pad([`SUBTOTAL — ${t}`, '', '', '', '', '', money(typeSubtotal), '', '', '', ''], 11));
        }
        lines.push(pad(['GRAND TOTAL', '', '', '', '', '', money(grandTotal), '', '', '', ''], 11));

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 6 — Account Activity (debits / credits per account)
        // ─────────────────────────────────────────────────────────────────────
        const accountActivity = new Map<string, { debit: number; credit: number }>();
        for (const e of period.journalEntries) {
            if (!accountActivity.has(e.debitAccount)) accountActivity.set(e.debitAccount, { debit: 0, credit: 0 });
            if (!accountActivity.has(e.creditAccount)) accountActivity.set(e.creditAccount, { debit: 0, credit: 0 });
            accountActivity.get(e.debitAccount)!.debit += e.amount;
            accountActivity.get(e.creditAccount)!.credit += e.amount;
        }
        let totalDebits = 0;
        let totalCredits = 0;
        lines.push('');
        lines.push(`═══ ACCOUNT ACTIVITY (debits / credits per account — should balance) ═══`);
        lines.push('Account,Debits,Credits,Net (DR − CR)');
        const sortedAccounts = Array.from(accountActivity.entries()).sort(([a], [b]) => a.localeCompare(b));
        for (const [account, agg] of sortedAccounts) {
            totalDebits += agg.debit;
            totalCredits += agg.credit;
            lines.push([esc(account), money(agg.debit), money(agg.credit), money(agg.debit - agg.credit)].join(','));
        }
        lines.push(['TOTAL', money(totalDebits), money(totalCredits), money(totalDebits - totalCredits)].join(','));
        lines.push(`,,,${Math.abs(totalDebits - totalCredits) < 0.01 ? 'BOOKS BALANCE ✓' : 'OUT OF BALANCE — review'}`);

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 7 — Capitalization Audit Trail (ticket-level)
        // ─────────────────────────────────────────────────────────────────────
        lines.push('');
        const capEntries = period.journalEntries.filter(e => e.entryType === 'CAPITALIZATION');
        const totalCapAuditRows = capEntries.reduce((s, e) => s + e.auditTrails.length, 0);
        lines.push(`═══ CAPITALIZATION AUDIT TRAIL (${totalCapAuditRows} ticket allocations) ═══`);
        lines.push('Project,Epic Key,Developer,Ticket ID,Issue Type,Story Points,Allocated Amount,Resolution Date');
        let capAllAudit = 0;
        for (const entry of capEntries) {
            let entrySubtotal = 0;
            for (const at of entry.auditTrails) {
                entrySubtotal += at.allocatedAmount;
                lines.push([
                    esc(entry.project?.name ?? '—'),
                    entry.project?.epicKey ?? '',
                    esc(at.developerName),
                    at.ticketId,
                    at.jiraTicket.issueType,
                    at.jiraTicket.storyPoints,
                    money(at.allocatedAmount),
                    isoDate(at.jiraTicket.resolutionDate),
                ].join(','));
            }
            if (entry.auditTrails.length > 0) {
                lines.push(pad([
                    `SUBTOTAL — ${entry.project?.name ?? 'Period Adjustment'}`,
                    '', '', '', '', '', money(entrySubtotal), '',
                ], 8));
            }
            capAllAudit += entrySubtotal;
        }
        lines.push(pad(['GRAND TOTAL — Capitalization Audit Trail', '', '', '', '', '', money(capAllAudit), ''], 8));

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 8 — Expense Audit Trail (BUG + TASK ticket-level)
        // ─────────────────────────────────────────────────────────────────────
        const expEntries = period.journalEntries.filter(e =>
            e.entryType === 'EXPENSE_BUG' || e.entryType === 'EXPENSE_TASK' || e.entryType === 'EXPENSE'
        );
        const totalExpAuditRows = expEntries.reduce((s, e) => s + e.auditTrails.length, 0);
        if (totalExpAuditRows > 0) {
            lines.push('');
            lines.push(`═══ EXPENSE AUDIT TRAIL (${totalExpAuditRows} ticket allocations) ═══`);
            lines.push('Bucket,Project,Epic Key,Developer,Ticket ID,Issue Type,Story Points,Allocated Amount');
            let expAllAudit = 0;
            for (const entry of expEntries) {
                let entrySubtotal = 0;
                for (const at of entry.auditTrails) {
                    entrySubtotal += at.allocatedAmount;
                    lines.push([
                        entry.entryType,
                        esc(entry.project?.name ?? 'Unallocated'),
                        entry.project?.epicKey ?? '',
                        esc(at.developerName),
                        at.ticketId,
                        at.jiraTicket.issueType,
                        at.jiraTicket.storyPoints,
                        money(at.allocatedAmount),
                    ].join(','));
                }
                if (entry.auditTrails.length > 0) {
                    lines.push(pad([
                        `SUBTOTAL — ${entry.entryType} ${entry.project?.name ?? 'Unallocated'}`,
                        '', '', '', '', '', '', money(entrySubtotal),
                    ], 8));
                }
                expAllAudit += entrySubtotal;
            }
            lines.push(pad(['GRAND TOTAL — Expense Audit Trail', '', '', '', '', '', '', money(expAllAudit)], 8));
        }

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 9 — Amortization Detail for THIS Period
        // ─────────────────────────────────────────────────────────────────────
        // Per-ticket monthly amortization charge for the period (the actual
        // numbers that build the AMORTIZATION journal entries).
        lines.push('');
        lines.push(`═══ AMORTIZATION DETAIL — ${monthLabel} ═══`);
        lines.push('Project,Epic Key,Ticket ID,Issue Type,Cost Basis,Useful Life (mo),Months Elapsed,Monthly Charge,Accumulated,Net Book Value,Resolution Date');
        const projectAmortTotals = new Map<string, { name: string; epic: string; charge: number; accumulated: number; nbv: number; basis: number; tickets: number }>();
        for (const t of amortTickets) {
            const a = calculateTicketAmortization(t.allocatedAmount, t.amortizationMonths, t.resolutionDate!, asOfDate);
            const pid = t.projectId || '__noproj__';
            if (!projectAmortTotals.has(pid)) {
                projectAmortTotals.set(pid, {
                    name: t.project?.name ?? '—',
                    epic: t.project?.epicKey ?? '',
                    charge: 0, accumulated: 0, nbv: 0, basis: 0, tickets: 0,
                });
            }
            const agg = projectAmortTotals.get(pid)!;
            agg.charge += a.monthlyAmortization;
            agg.accumulated += a.totalAmortization;
            agg.nbv += a.nbv;
            agg.basis += t.allocatedAmount;
            agg.tickets += 1;

            lines.push([
                esc(t.project?.name ?? '—'),
                t.project?.epicKey ?? '',
                t.ticketId,
                t.issueType,
                money(t.allocatedAmount),
                t.amortizationMonths,
                a.monthsElapsed,
                money(a.monthlyAmortization),
                money(a.totalAmortization),
                money(a.nbv),
                isoDate(t.resolutionDate),
            ].join(','));
        }
        let amortBasisGrand = 0, amortChargeGrand = 0, amortAccumGrand = 0, amortNbvGrand = 0;
        for (const [, agg] of projectAmortTotals) {
            amortBasisGrand   += agg.basis;
            amortChargeGrand  += agg.charge;
            amortAccumGrand   += agg.accumulated;
            amortNbvGrand     += agg.nbv;
            lines.push(pad([
                `SUBTOTAL — ${agg.name} (${agg.tickets} ticket${agg.tickets === 1 ? '' : 's'})`,
                agg.epic, '', '',
                money(agg.basis), '', '',
                money(agg.charge), money(agg.accumulated), money(agg.nbv), '',
            ], 11));
        }
        lines.push(pad([
            'GRAND TOTAL — Amortization',
            '', '', '',
            money(amortBasisGrand), '', '',
            money(amortChargeGrand), money(amortAccumGrand), money(amortNbvGrand), '',
        ], 11));
        // Tie-out: per-ticket charge total should match AMORTIZATION JE total
        const amortDelta = amortChargeGrand - totalAmortization;
        lines.push(pad([
            `TIE-OUT — Δ vs AMORTIZATION journal entries: ${money(amortDelta)} (${Math.abs(amortDelta) < 1 ? 'PASS' : 'REVIEW'})`,
            '', '', '', '', '', '', '', '', '', '',
        ], 11));

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 10 — Payroll Register (per pay date subtotals + grand total)
        // ─────────────────────────────────────────────────────────────────────
        lines.push('');
        const totalPayrollEntries = payrollImports.reduce((s, pi) => s + pi.entries.length, 0);
        const uniqueDevs = new Set<string>();
        for (const pi of payrollImports) for (const pe of pi.entries) uniqueDevs.add(pe.developer.id);
        lines.push(`═══ PAYROLL REGISTER (${totalPayrollEntries} entries · ${uniqueDevs.size} developers) ═══`);
        lines.push('Pay Date,Label,Developer,Email,Gross Salary,SBC Amount,Fringe Rate,Fringe Amount,Loaded Cost');

        let grandGross = 0, grandSbc = 0, grandFringe = 0, grandLoaded = 0;
        for (const pi of payrollImports) {
            let impGross = 0, impSbc = 0, impFringe = 0, impLoaded = 0;
            for (const pe of pi.entries) {
                const fr = pi.fringeBenefitRate ?? fringeRate;
                const fringeAmt = pe.grossSalary * fr;
                const loaded = pe.grossSalary + fringeAmt + pe.sbcAmount;
                impGross += pe.grossSalary;
                impSbc += pe.sbcAmount;
                impFringe += fringeAmt;
                impLoaded += loaded;
                lines.push([
                    isoDate(pi.payDate),
                    esc(pi.label),
                    esc(pe.developer.name),
                    pe.developer.email,
                    money(pe.grossSalary),
                    money(pe.sbcAmount),
                    (fr * 100).toFixed(2) + '%',
                    money(fringeAmt),
                    money(loaded),
                ].join(','));
            }
            lines.push(pad([
                `SUBTOTAL — ${pi.label} (${pi.entries.length} entries)`,
                '', '', '',
                money(impGross), money(impSbc), '',
                money(impFringe), money(impLoaded),
            ], 9));
            grandGross += impGross;
            grandSbc += impSbc;
            grandFringe += impFringe;
            grandLoaded += impLoaded;
        }
        lines.push(pad([
            'GRAND TOTAL — Payroll',
            '', '', '',
            money(grandGross), money(grandSbc), '',
            money(grandFringe), money(grandLoaded),
        ], 9));

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 11 — Developer Cost Allocation (payroll → cap/exp bridge)
        // ─────────────────────────────────────────────────────────────────────
        // Per developer: fully loaded payroll, capitalized $, expensed $, delta.
        // Built by joining payroll register with audit-trail allocations on
        // developer name (audit trails store the developer name at gen time).
        const payrollByDevName = new Map<string, number>();
        const payrollGrossByDevName = new Map<string, number>();
        const payrollSbcByDevName = new Map<string, number>();
        for (const pi of payrollImports) {
            const fr = pi.fringeBenefitRate ?? fringeRate;
            for (const pe of pi.entries) {
                const fringeAmt = pe.grossSalary * fr;
                const loaded = pe.grossSalary + fringeAmt + pe.sbcAmount;
                payrollByDevName.set(pe.developer.name, (payrollByDevName.get(pe.developer.name) || 0) + loaded);
                payrollGrossByDevName.set(pe.developer.name, (payrollGrossByDevName.get(pe.developer.name) || 0) + pe.grossSalary);
                payrollSbcByDevName.set(pe.developer.name, (payrollSbcByDevName.get(pe.developer.name) || 0) + pe.sbcAmount);
            }
        }
        const capByDev = new Map<string, number>();
        const expByDev = new Map<string, number>();
        for (const e of period.journalEntries) {
            const target = e.entryType === 'CAPITALIZATION' ? capByDev
                : (e.entryType === 'EXPENSE_BUG' || e.entryType === 'EXPENSE_TASK' || e.entryType === 'EXPENSE') ? expByDev
                : null;
            if (!target) continue;
            for (const at of e.auditTrails) {
                target.set(at.developerName, (target.get(at.developerName) || 0) + at.allocatedAmount);
            }
        }
        const allDevs = new Set<string>([
            ...payrollByDevName.keys(),
            ...capByDev.keys(),
            ...expByDev.keys(),
        ]);
        const sortedDevs = Array.from(allDevs).sort((a, b) => a.localeCompare(b));

        lines.push('');
        lines.push(`═══ DEVELOPER COST ALLOCATION (payroll → cap/expense bridge) ═══`);
        lines.push('Developer,Gross Salary,SBC,Fully Loaded Payroll,Capitalized,Expensed,Cap+Exp,Δ vs Loaded');
        let dGross = 0, dSbc = 0, dLoaded = 0, dCap = 0, dExp = 0;
        for (const name of sortedDevs) {
            const gross = payrollGrossByDevName.get(name) || 0;
            const sbc = payrollSbcByDevName.get(name) || 0;
            const loaded = payrollByDevName.get(name) || 0;
            const cap = capByDev.get(name) || 0;
            const exp = expByDev.get(name) || 0;
            const delta = loaded - (cap + exp);
            dGross += gross; dSbc += sbc; dLoaded += loaded; dCap += cap; dExp += exp;
            lines.push([
                esc(name),
                money(gross), money(sbc), money(loaded),
                money(cap), money(exp), money(cap + exp),
                money(delta),
            ].join(','));
        }
        lines.push([
            'GRAND TOTAL',
            money(dGross), money(dSbc), money(dLoaded),
            money(dCap), money(dExp), money(dCap + dExp),
            money(dLoaded - (dCap + dExp)),
        ].join(','));
        lines.push(`,,,,,,,Note: Δ ≠ 0 expected — overhead/meeting time goes to ADJUSTMENT (${money(totalAdjustment)})`);

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 12 — Tickets Worked During Period (open + resolved)
        // ─────────────────────────────────────────────────────────────────────
        lines.push('');
        lines.push(`═══ TICKETS WORKED DURING PERIOD (${ticketsWorked.length}) ═══`);
        lines.push('Ticket ID,Epic Key,Project,Project Status,Issue Type,Summary,Story Points,Applied SP,Assignee,Status,Resolution Date,Classification (current rules)');

        const appliedSP = (t: { storyPoints: number; issueType: string }) =>
            t.storyPoints > 0 ? t.storyPoints
            : t.issueType.toUpperCase() === 'BUG' ? bugSpFallback : otherSpFallback;

        // Subtotals by issue type
        const ticketTypeAgg = new Map<string, { count: number; sp: number; appliedSp: number }>();
        for (const t of ticketsWorked) {
            const type = (t.issueType || 'UNKNOWN').toUpperCase();
            if (!ticketTypeAgg.has(type)) ticketTypeAgg.set(type, { count: 0, sp: 0, appliedSp: 0 });
            const agg = ticketTypeAgg.get(type)!;
            agg.count += 1;
            agg.sp += t.storyPoints || 0;
            agg.appliedSp += appliedSP(t);

            const klass = classifyTicket(rules, t, t.project);
            const isResolved = !!t.resolutionDate
                && t.resolutionDate >= periodStart
                && t.resolutionDate <= periodEndDate;
            lines.push([
                t.ticketId,
                t.epicKey,
                esc(t.project?.name || ''),
                t.project?.status || '',
                t.issueType,
                esc(t.summary),
                t.storyPoints,
                appliedSP(t),
                esc(t.assigneeId || ''),
                isResolved ? 'RESOLVED IN PERIOD' : 'OPEN',
                isoDate(t.resolutionDate),
                klass,
            ].join(','));
        }
        let totalTicketCount = 0, totalSp = 0, totalAppliedSp = 0;
        for (const [type, agg] of Array.from(ticketTypeAgg.entries()).sort()) {
            totalTicketCount += agg.count;
            totalSp += agg.sp;
            totalAppliedSp += agg.appliedSp;
            lines.push(pad([
                `SUBTOTAL — ${type}`,
                `${agg.count} tickets`, '', '', '', '',
                agg.sp, agg.appliedSp, '', '', '', '',
            ], 12));
        }
        lines.push(pad([
            'GRAND TOTAL',
            `${totalTicketCount} tickets`, '', '', '', '',
            totalSp, totalAppliedSp, '', '', '', '',
        ], 12));

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 13 — Active Projects + Cumulative Amortization Schedule
        // ─────────────────────────────────────────────────────────────────────
        lines.push('');
        lines.push(`═══ ACTIVE PROJECTS — CUMULATIVE AMORTIZATION SCHEDULE (${projects.length} projects) ═══`);
        lines.push('Project,Epic Key,Status,Capitalizable,Mgmt Auth,Probable to Complete,Launch Date,Useful Life (mo),Accumulated Cost,Starting Balance,Starting Amort,Monthly Charge,Total Amortization,Net Book Value,Months Elapsed');

        let pAccum = 0, pStartBal = 0, pStartAmort = 0, pMonthly = 0, pTotalAmort = 0, pNbv = 0;
        for (const p of projects) {
            const a = calculateAmortization(
                p.accumulatedCost,
                p.startingBalance,
                p.startingAmortization,
                p.amortizationMonths,
                p.launchDate,
                periodEndDate,
            );
            pAccum      += p.accumulatedCost;
            pStartBal   += p.startingBalance;
            pStartAmort += p.startingAmortization;
            pMonthly    += a.monthlyAmortization;
            pTotalAmort += a.totalAmortization;
            pNbv        += a.netBookValue;
            lines.push([
                esc(p.name),
                p.epicKey,
                p.status,
                p.isCapitalizable ? 'Yes' : 'No',
                (p as { mgmtAuthorized?: boolean }).mgmtAuthorized ? 'Yes' : 'No',
                (p as { probableToComplete?: boolean }).probableToComplete ? 'Yes' : 'No',
                isoDate(p.launchDate),
                p.amortizationMonths,
                money(p.accumulatedCost),
                money(p.startingBalance),
                money(p.startingAmortization),
                money(a.monthlyAmortization),
                money(a.totalAmortization),
                money(a.netBookValue),
                a.monthsElapsed,
            ].join(','));
        }
        lines.push(pad([
            'GRAND TOTAL', '', '', '', '', '', '', '',
            money(pAccum), money(pStartBal), money(pStartAmort),
            money(pMonthly), money(pTotalAmort), money(pNbv), '',
        ], 15));

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 14 — Amortization Overrides
        // ─────────────────────────────────────────────────────────────────────
        const projectsWithOverrides = projects.filter(p => p.amortOverrides.length > 0);
        if (projectsWithOverrides.length > 0) {
            lines.push('');
            lines.push(`═══ AMORTIZATION OVERRIDES ═══`);
            lines.push('Project,Epic Key,Month,Year,Override Charge');
            let ovTotal = 0;
            for (const p of projectsWithOverrides) {
                for (const ov of p.amortOverrides) {
                    ovTotal += ov.charge;
                    lines.push([
                        esc(p.name),
                        p.epicKey,
                        MONTH_NAMES[ov.month - 1],
                        ov.year,
                        money(ov.charge),
                    ].join(','));
                }
            }
            lines.push(['GRAND TOTAL', '', '', '', money(ovTotal)].join(','));
        }

        // ── Footer ──────────────────────────────────────────────────────────
        lines.push('');
        lines.push(`═══ END OF EXPORT ═══`);
        lines.push(`Generated by No Cap audit export · ${exportedAt}`);

        // ── Return CSV ──────────────────────────────────────────────────────

        const csv = lines.join('\n');
        const filename = `master-export-${MONTH_NAMES[month - 1]}-${year}.csv`;

        return new Response(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error('Master export error:', error);
        return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 });
    }
}
