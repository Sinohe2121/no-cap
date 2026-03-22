export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { calculateAmortization } from '@/lib/calculations';

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

        const periodEnd = new Date(year, month - 1, 28); // "as of" date for amort calculations

        // ── 1. Period + Journal Entries ──────────────────────────────────────

        const period = await prisma.accountingPeriod.findUnique({
            where: { month_year: { month, year } },
            include: {
                journalEntries: {
                    include: {
                        project: true,
                        auditTrails: {
                            include: { jiraTicket: true },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!period) {
            return NextResponse.json({ error: 'Period not found — generate journal entries first' }, { status: 404 });
        }

        // ── 2. All tickets for the period ───────────────────────────────────

        const periodStart = new Date(year, month - 1, 1);
        const periodEndDate = new Date(year, month, 0, 23, 59, 59);

        const tickets = await prisma.jiraTicket.findMany({
            where: {
                resolutionDate: { gte: periodStart, lte: periodEndDate },
            },
            include: {
                project: { select: { name: true, isCapitalizable: true, status: true } },
            },
            orderBy: { resolutionDate: 'asc' },
        });

        // ── 3. Payroll for the period ───────────────────────────────────────

        const payrollImports = await prisma.payrollImport.findMany({
            where: {
                payDate: { gte: periodStart, lte: periodEndDate },
            },
            include: {
                entries: {
                    include: { developer: { select: { name: true, email: true } } },
                },
            },
            orderBy: { payDate: 'asc' },
        });

        // ── 4. Active projects + amortization ───────────────────────────────

        const projects = await prisma.project.findMany({
            where: {
                OR: [
                    { status: { in: ['DEV', 'LIVE'] } },
                    { accumulatedCost: { gt: 0 } },
                    { startingBalance: { gt: 0 } },
                ],
            },
            include: {
                amortOverrides: {
                    orderBy: [{ year: 'asc' }, { month: 'asc' }],
                },
            },
            orderBy: { name: 'asc' },
        });

        // ── Build CSV ───────────────────────────────────────────────────────

        const lines: string[] = [];
        const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

        // ▸ Section 1: Period Summary
        lines.push(`═══ PERIOD SUMMARY: ${monthLabel} ═══`);
        lines.push('Month,Year,Status,Total Capitalized,Total Expensed,Total Amortization,Grand Total,Cap Rate');
        const grandTotal = period.totalCapitalized + period.totalExpensed + period.totalAmortization;
        const capRate = (period.totalCapitalized + period.totalExpensed) > 0
            ? ((period.totalCapitalized / (period.totalCapitalized + period.totalExpensed)) * 100).toFixed(1) + '%'
            : '0%';
        lines.push([
            MONTH_NAMES[month - 1], year, period.status,
            money(period.totalCapitalized), money(period.totalExpensed),
            money(period.totalAmortization), money(grandTotal), capRate,
        ].join(','));

        // ▸ Section 2: Journal Entries
        lines.push('');
        lines.push(`═══ JOURNAL ENTRIES (${period.journalEntries.length}) ═══`);
        lines.push('Entry Type,Project,Epic Key,Project Status,Debit Account,Credit Account,Amount,Mgmt Authorized,Probable to Complete,Tickets,Developers');
        for (const entry of period.journalEntries) {
            const devNames = new Set(entry.auditTrails.map(t => t.developerName));
            lines.push([
                entry.entryType,
                esc(entry.project.name),
                entry.project.epicKey,
                entry.project.status,
                entry.debitAccount,
                entry.creditAccount,
                money(entry.amount),
                entry.project.mgmtAuthorized ? 'Yes' : 'No',
                entry.project.probableToComplete ? 'Yes' : 'No',
                entry.auditTrails.length,
                devNames.size,
            ].join(','));
        }

        // ▸ Section 3: Tickets
        lines.push('');
        lines.push(`═══ TICKETS RESOLVED IN PERIOD (${tickets.length}) ═══`);
        lines.push('Ticket ID,Epic Key,Project,Issue Type,Summary,Story Points,Assignee,Resolution Date,Capitalizable,Project Status');
        for (const t of tickets) {
            lines.push([
                t.ticketId,
                t.epicKey,
                esc(t.project?.name || ''),
                t.issueType,
                esc(t.summary),
                t.storyPoints,
                t.assigneeId || '',
                isoDate(t.resolutionDate),
                t.project?.isCapitalizable ? 'Yes' : 'No',
                t.project?.status || '',
            ].join(','));
        }

        // ▸ Section 4: Payroll Register
        lines.push('');
        const totalPayrollEntries = payrollImports.reduce((s, pi) => s + pi.entries.length, 0);
        lines.push(`═══ PAYROLL REGISTER (${totalPayrollEntries} entries) ═══`);
        lines.push('Pay Date,Developer,Email,Gross Salary,SBC Amount,Fringe Rate,Fringe Amount,Loaded Cost');
        for (const pi of payrollImports) {
            for (const pe of pi.entries) {
                const fringeAmt = pe.grossSalary * pi.fringeBenefitRate;
                const loaded = pe.grossSalary + fringeAmt + pe.sbcAmount;
                lines.push([
                    isoDate(pi.payDate),
                    esc(pe.developer.name),
                    pe.developer.email,
                    money(pe.grossSalary),
                    money(pe.sbcAmount),
                    (pi.fringeBenefitRate * 100).toFixed(1) + '%',
                    money(fringeAmt),
                    money(loaded),
                ].join(','));
            }
        }

        // ▸ Section 5: Amortization Schedules
        lines.push('');
        lines.push(`═══ AMORTIZATION SCHEDULES (${projects.length} projects) ═══`);
        lines.push('Project,Epic Key,Status,Launch Date,Useful Life (mo),Accumulated Cost,Starting Balance,Starting Amort,Monthly Charge,Total Amortization,Net Book Value,Months Elapsed');
        for (const p of projects) {
            const amort = calculateAmortization(
                p.accumulatedCost,
                p.startingBalance,
                p.startingAmortization,
                p.amortizationMonths,
                p.launchDate,
                periodEnd,
            );
            lines.push([
                esc(p.name),
                p.epicKey,
                p.status,
                isoDate(p.launchDate),
                p.amortizationMonths,
                money(p.accumulatedCost),
                money(p.startingBalance),
                money(p.startingAmortization),
                money(amort.monthlyAmortization),
                money(amort.totalAmortization),
                money(amort.netBookValue),
                amort.monthsElapsed,
            ].join(','));
        }

        // ── Amortization overrides sub-section ──
        const projectsWithOverrides = projects.filter(p => p.amortOverrides.length > 0);
        if (projectsWithOverrides.length > 0) {
            lines.push('');
            lines.push('═══ AMORTIZATION OVERRIDES ═══');
            lines.push('Project,Epic Key,Month,Year,Override Charge');
            for (const p of projectsWithOverrides) {
                for (const ov of p.amortOverrides) {
                    lines.push([
                        esc(p.name),
                        p.epicKey,
                        MONTH_NAMES[ov.month - 1],
                        ov.year,
                        money(ov.charge),
                    ].join(','));
                }
            }
        }

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
