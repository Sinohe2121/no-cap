import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/tickets/:id
 *
 * Returns full ticket detail including assignee, project, audit trails,
 * and a computed month-by-month amortization schedule.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;

        const ticket = await prisma.jiraTicket.findUnique({
            where: { id },
            include: {
                assignee: {
                    select: { id: true, name: true, email: true, role: true },
                },
                project: {
                    select: {
                        id: true,
                        name: true,
                        epicKey: true,
                        status: true,
                        amortizationMonths: true,
                        launchDate: true,
                    },
                },
                auditTrails: {
                    include: {
                        journalEntry: {
                            include: {
                                period: {
                                    select: { month: true, year: true },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // ── Compute actual capitalized amount from audit trails ────────
        // ticket.capitalizedAmount is often 0; the real cost is the sum of audit trail allocations
        const allocatedCost = ticket.auditTrails.reduce((sum, a) => sum + a.allocatedAmount, 0);
        const capitalizedAmount = allocatedCost > 0 ? allocatedCost : ticket.capitalizedAmount;
        const amortMonths = ticket.amortizationMonths || ticket.project?.amortizationMonths || 36;
        const resolutionDate = ticket.resolutionDate;

        // ── Build amortization schedule ──────────────────────────────────
        let amortizationSchedule: {
            month: number;
            year: number;
            label: string;
            monthlyAmortization: number;
            cumulativeAmortization: number;
            netBookValue: number;
            isCurrent: boolean;
        }[] = [];

        if (resolutionDate && capitalizedAmount > 0) {
            const monthlyAmort = capitalizedAmount / amortMonths;

            // Amortization starts the first of the month AFTER resolution
            let currentMonth = resolutionDate.getMonth() + 2; // 0-indexed → 1-indexed + next month
            let currentYear = resolutionDate.getFullYear();
            if (currentMonth > 12) {
                currentMonth = 1;
                currentYear += 1;
            }

            const now = new Date();
            const nowMonth = now.getMonth() + 1;
            const nowYear = now.getFullYear();

            let cumulative = 0;

            for (let i = 0; i < amortMonths; i++) {
                const monthly = Math.min(monthlyAmort, capitalizedAmount - cumulative);
                cumulative += monthly;
                const nbv = Math.max(0, capitalizedAmount - cumulative);

                const isCurrent = currentMonth === nowMonth && currentYear === nowYear;

                const label = new Date(currentYear, currentMonth - 1).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                });

                amortizationSchedule.push({
                    month: currentMonth,
                    year: currentYear,
                    label,
                    monthlyAmortization: Math.round(monthly * 100) / 100,
                    cumulativeAmortization: Math.round(cumulative * 100) / 100,
                    netBookValue: Math.round(nbv * 100) / 100,
                    isCurrent,
                });

                // Advance to next month
                currentMonth++;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                }
            }
        }

        return NextResponse.json({
            ticket: {
                id: ticket.id,
                ticketId: ticket.ticketId,
                epicKey: ticket.epicKey,
                issueType: ticket.issueType,
                summary: ticket.summary,
                storyPoints: ticket.storyPoints,
                resolutionDate: ticket.resolutionDate,
                fixVersion: ticket.fixVersion,
                importPeriod: ticket.importPeriod,
                capitalizedAmount,
                amortizationMonths: amortMonths,
                firstCapitalizedDate: ticket.firstCapitalizedDate,
                monthsCapitalized: ticket.firstCapitalizedDate
                    ? Math.max(1, Math.ceil(
                        (Date.now() - new Date(ticket.firstCapitalizedDate).getTime()) /
                        (1000 * 60 * 60 * 24 * 30.44)
                      ))
                    : null,
                createdAt: ticket.createdAt,
                customFields: ticket.customFields as Record<string, string> | null,
            },
            assignee: ticket.assignee,
            project: ticket.project,
            auditTrails: ticket.auditTrails.map((at) => ({
                id: at.id,
                allocatedAmount: at.allocatedAmount,
                developerName: at.developerName,
                period: at.journalEntry?.period
                    ? {
                          month: at.journalEntry.period.month,
                          year: at.journalEntry.period.year,
                      }
                    : null,
            })),
            amortizationSchedule,
        });
    } catch (error) {
        console.error('Error fetching ticket detail:', error);
        return NextResponse.json(
            { error: 'Failed to load ticket detail' },
            { status: 500 },
        );
    }
}
