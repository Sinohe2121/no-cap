import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateAmortization } from '@/lib/calculations';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const month = parseInt(searchParams.get('month') || '0');
        const year = parseInt(searchParams.get('year') || '0');

        if (!month || !year) {
            return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
        }

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
                    orderBy: { entryType: 'asc' },
                },
            },
        });

        if (!period) {
            return NextResponse.json({ error: 'Period not found' }, { status: 404 });
        }

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const periodLabel = `${monthNames[month - 1]} ${year}`;

        const rows: string[][] = [];

        // Header
        rows.push([
            'Entry Type', 'Account', 'Debit', 'Credit', 'Project',
            'Description', 'Developer', 'Ticket ID', 'Ticket Summary',
            'Issue Type', 'Story Points', 'Allocated Amount',
            'Launch Date', 'Useful Life (Months)', 'Monthly Rate',
            'Months Elapsed', 'Total Cost Basis', 'Accumulated Amortization',
            'Net Book Value',
        ]);

        const fmt = (n: number) => n.toFixed(2);

        for (const entry of period.journalEntries) {

            // Main accounting entry row — debit line
            rows.push([
                entry.entryType,
                entry.debitAccount,
                fmt(entry.amount), // Debit amount
                '', // No credit on debit line
                entry.project.name,
                entry.description || '',
                '', '', '', '', '', '',
                '', '', '', '', '', '', '',
            ]);

            // Main accounting entry row — credit line
            rows.push([
                entry.entryType,
                entry.creditAccount,
                '', // No debit on credit line
                fmt(entry.amount), // Credit amount
                entry.project.name,
                entry.description || '',
                '', '', '', '', '', '',
                '', '', '', '', '', '', '',
            ]);

            // Supporting detail: audit trails (for CAPITALIZATION / EXPENSE)
            if (entry.auditTrails.length > 0) {
                for (const trail of entry.auditTrails) {
                    rows.push([
                        '', // Entry type (blank — supporting detail)
                        '', // Account
                        '', '', // No debit/credit
                        entry.project.name,
                        'Supporting Detail',
                        trail.developerName,
                        trail.ticketId,
                        trail.jiraTicket.summary,
                        trail.jiraTicket.issueType,
                        trail.jiraTicket.storyPoints.toString(),
                        fmt(trail.allocatedAmount),
                        '', '', '', '', '', '', '',
                    ]);
                }
            }

            // Supporting detail: amortization schedule
            if (entry.entryType === 'AMORTIZATION' && entry.project.launchDate) {
                const amort = calculateAmortization(
                    entry.project.accumulatedCost,
                    entry.project.startingBalance,
                    entry.project.startingAmortization,
                    entry.project.amortizationMonths,
                    entry.project.launchDate,
                    new Date(year, month - 1, 15),
                );
                rows.push([
                    '', '', '', '',
                    entry.project.name,
                    'Amortization Schedule Detail',
                    '', '', '', '', '', '',
                    entry.project.launchDate.toISOString().split('T')[0],
                    entry.project.amortizationMonths.toString(),
                    fmt(amort.monthlyAmortization),
                    amort.monthsElapsed.toString(),
                    fmt(entry.project.accumulatedCost + entry.project.startingBalance),
                    fmt(amort.totalAmortization),
                    fmt(amort.netBookValue),
                ]);
            }

            // Blank separator row between entries
            rows.push(new Array(19).fill(''));
        }

        // Summary row
        rows.push([
            'TOTALS', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
        ]);
        rows.push([
            'Capitalized', '', fmt(period.totalCapitalized), fmt(period.totalCapitalized),
            '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
        ]);
        rows.push([
            'Expensed', '', fmt(period.totalExpensed), fmt(period.totalExpensed),
            '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
        ]);
        rows.push([
            'Amortization', '', fmt(period.totalAmortization), fmt(period.totalAmortization),
            '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
        ]);

        // Build CSV string
        const escapeCSV = (val: string) => {
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        };

        const csv = rows.map(row => row.map(escapeCSV).join(',')).join('\n');

        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="Audit_Trail_${periodLabel.replace(' ', '_')}.csv"`,
            },
        });
    } catch (error) {
        console.error('CSV export error:', error);
        return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
    }
}
