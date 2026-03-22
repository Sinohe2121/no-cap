export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';
import { calculatePeriodCosts, calculateTicketAmortization } from '@/lib/calculations';
import { ACCOUNTS, PERIOD_STATUSES, ENTRY_TYPES, ISSUE_TYPES } from '@/lib/constants';
import { UpdatePeriodStatusSchema, GenerateEntriesSchema, formatZodError } from '@/lib/validations';

// GET — return all accounting periods
export async function GET() {
    try {
        const periods = await prisma.accountingPeriod.findMany({
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
            include: {
                journalEntries: {
                    include: {
                        project: {
                            select: { id: true, name: true },
                        },
                    },
                },
            },
        });
        return NextResponse.json(periods);
    } catch (error) {
        return handleApiError(error, 'Failed to load accounting periods');
    }
}

// PATCH — update period status
export async function PATCH(request: Request) {
    try {
        const raw = await request.json();
        const parsed = UpdatePeriodStatusSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { periodId, status } = parsed.data;

        const updated = await prisma.accountingPeriod.update({
            where: { id: periodId },
            data: { status },
        });
        return NextResponse.json(updated);
    } catch (error) {
        console.error('Period status update error:', error);
        return NextResponse.json({ error: 'Failed to update period status' }, { status: 500 });
    }
}

// POST — generate journal entries for a given period
export async function POST(request: Request) {
    try {
        const raw = await request.json();
        const parsed = GenerateEntriesSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { month, year } = parsed.data;

        // Upsert accounting period
        let period = await prisma.accountingPeriod.findFirst({ where: { month, year } });

        if (period?.status === 'CLOSED') {
            return NextResponse.json({ error: 'Period is closed. Reopen it before generating entries.' }, { status: 409 });
        }

        if (!period) {
            period = await prisma.accountingPeriod.create({
                data: { month, year, status: 'OPEN' },
            });
        }

        // Delete existing journal entries for this period to recalculate
        // First reverse any accumulatedCost increments from previous generation
        const existingEntries = await prisma.journalEntry.findMany({
            where: { periodId: period.id, entryType: ENTRY_TYPES.CAPITALIZATION },
            select: { id: true, projectId: true, amount: true },
        });

        // Batch reverse project accumulatedCost (group by projectId first)
        const projectDecrements: Record<string, number> = {};
        for (const entry of existingEntries) {
            if (entry.projectId) {
                projectDecrements[entry.projectId] = (projectDecrements[entry.projectId] || 0) + entry.amount;
            }
        }
        await Promise.all(
            Object.entries(projectDecrements).map(([pid, amt]) =>
                prisma.project.update({ where: { id: pid }, data: { accumulatedCost: { decrement: amt } } })
            )
        );

        // ── CRITICAL: Batch reverse ticket-level capitalizedAmount from previous generation ──
        const existingCapEntryIds = existingEntries.map(e => e.id);
        if (existingCapEntryIds.length > 0) {
            const existingAuditTrails = await prisma.auditTrail.findMany({
                where: { journalEntryId: { in: existingCapEntryIds } },
                select: { jiraTicketId: true, allocatedAmount: true },
            });

            // Aggregate amounts per ticket
            const ticketReversal: Record<string, number> = {};
            for (const at of existingAuditTrails) {
                ticketReversal[at.jiraTicketId] = (ticketReversal[at.jiraTicketId] || 0) + at.allocatedAmount;
            }

            // Batch fetch all tickets that need reversal, then batch update
            const ticketIds = Object.keys(ticketReversal);
            if (ticketIds.length > 0) {
                const tickets = await prisma.jiraTicket.findMany({
                    where: { id: { in: ticketIds } },
                    select: { id: true, capitalizedAmount: true },
                });

                await Promise.all(
                    tickets.map(ticket => {
                        const reverseAmt = ticketReversal[ticket.id] || 0;
                        const newAmount = Math.max(0, (ticket.capitalizedAmount || 0) - reverseAmt);
                        return prisma.jiraTicket.update({
                            where: { id: ticket.id },
                            data: {
                                capitalizedAmount: newAmount,
                                ...(newAmount <= 0 ? { firstCapitalizedDate: null } : {}),
                            },
                        });
                    })
                );
            }
        }

        await prisma.journalEntry.deleteMany({ where: { periodId: period.id } });

        // ─── STEP 1: Calculate developer-level costs ────────────────────
        // Uses the new "open during period" ticket selection
        const costResults = await calculatePeriodCosts(month, year);

        let totalCapitalized = 0;
        let totalExpensed = 0;

        // Aggregate costs by project
        const projectCaps: Record<string, number> = {};
        const projectExps: Record<string, number> = {};

        for (const result of costResults) {
            totalCapitalized += result.capitalizedAmount;
            totalExpensed += result.expensedAmount;

            for (const proj of result.projectBreakdown) {
                if (proj.amount <= 0) continue;
                if (proj.isCapitalizable) {
                    projectCaps[proj.projectId] = (projectCaps[proj.projectId] || 0) + proj.amount;
                } else {
                    projectExps[proj.projectId] = (projectExps[proj.projectId] || 0) + proj.amount;
                }
            }
        }

        // Batch-fetch all projects
        const allProjectIds = Array.from(new Set([...Object.keys(projectCaps), ...Object.keys(projectExps)]));

        const allProjects = await prisma.project.findMany({
            where: { id: { in: allProjectIds } },
        });
        const projectNameMap = new Map(allProjects.map((p) => [p.id, p.name]));
        const projectAmortMap = new Map(allProjects.map((p) => [p.id, p.amortizationMonths]));

        // Pre-fetch ALL "open during period" tickets for audit trails
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);
        const periodTickets = await prisma.jiraTicket.findMany({
            where: {
                projectId: { in: allProjectIds },
                OR: [
                    { resolutionDate: null },
                    { resolutionDate: { gte: startDate, lte: endDate } },
                ],
            },
        });
        const ticketLookup = new Map<string, typeof periodTickets>();
        for (const ticket of periodTickets) {
            const key = `${ticket.projectId}::${ticket.assigneeId}`;
            const existing = ticketLookup.get(key) ?? [];
            existing.push(ticket);
            ticketLookup.set(key, existing);
        }

        // ─── STEP 2: Create capitalization entries + write to tickets ────
        const ticketUpdates: Promise<any>[] = [];
        const projectAccIncrements: Record<string, number> = {};

        for (const [projectId, amount] of Object.entries(projectCaps)) {
            const entry = await prisma.journalEntry.create({
                data: {
                    entryType: ENTRY_TYPES.CAPITALIZATION,
                    debitAccount: ACCOUNTS.WIP_SOFTWARE,
                    creditAccount: ACCOUNTS.RD_SALARIES,
                    amount,
                    description: `Capitalize ${projectNameMap.get(projectId) ?? projectId} development costs`,
                    periodId: period.id,
                    projectId,
                },
            });

            const auditRows: {
                journalEntryId: string;
                jiraTicketId: string;
                developerName: string;
                ticketId: string;
                allocatedAmount: number;
            }[] = [];

            for (const result of costResults) {
                const proj = result.projectBreakdown.find(
                    (p) => p.projectId === projectId && p.isCapitalizable && p.amount > 0
                );
                if (!proj) continue;

                const tickets = ticketLookup.get(`${projectId}::${result.developerId}`) ?? [];
                const capTickets = tickets.filter((t) => t.issueType === ISSUE_TYPES.STORY);
                const localPoints = capTickets.reduce((s, t) => s + t.storyPoints, 0);

                for (const ticket of capTickets) {
                    const ticketAllocation = localPoints > 0
                        ? proj.amount * (ticket.storyPoints / localPoints)
                        : 0;

                    auditRows.push({
                        journalEntryId: entry.id,
                        jiraTicketId: ticket.id,
                        developerName: result.developerName,
                        ticketId: ticket.ticketId,
                        allocatedAmount: ticketAllocation,
                    });

                    // Defer ticket updates to batch
                    ticketUpdates.push(
                        prisma.jiraTicket.update({
                            where: { id: ticket.id },
                            data: {
                                capitalizedAmount: { increment: ticketAllocation },
                                amortizationMonths: projectAmortMap.get(projectId) ?? 36,
                                ...(ticket.firstCapitalizedDate ? {} : { firstCapitalizedDate: startDate }),
                            },
                        })
                    );
                }
            }

            if (auditRows.length > 0) {
                await prisma.auditTrail.createMany({ data: auditRows });
            }

            projectAccIncrements[projectId] = (projectAccIncrements[projectId] || 0) + amount;
        }

        // Fire all ticket updates in parallel
        await Promise.all(ticketUpdates);

        // Batch update project accumulated costs
        await Promise.all(
            Object.entries(projectAccIncrements).map(([pid, amt]) =>
                prisma.project.update({ where: { id: pid }, data: { accumulatedCost: { increment: amt } } })
            )
        );

        // ─── STEP 3: Create expense entries per project ────────────────
        for (const [projectId, amount] of Object.entries(projectExps)) {
            const entry = await prisma.journalEntry.create({
                data: {
                    entryType: ENTRY_TYPES.EXPENSE,
                    debitAccount: ACCOUNTS.RD_EXPENSE_SOFTWARE,
                    creditAccount: ACCOUNTS.ACCRUED_PAYROLL,
                    amount,
                    description: `Expense ${projectNameMap.get(projectId) ?? projectId} non-capitalizable costs`,
                    periodId: period.id,
                    projectId,
                },
            });

            const auditRows: {
                journalEntryId: string;
                jiraTicketId: string;
                developerName: string;
                ticketId: string;
                allocatedAmount: number;
            }[] = [];

            for (const result of costResults) {
                const proj = result.projectBreakdown.find(
                    (p) => p.projectId === projectId && !p.isCapitalizable && p.points > 0
                );
                if (!proj) continue;

                const tickets = ticketLookup.get(`${projectId}::${result.developerId}`) ?? [];
                for (const ticket of tickets) {
                    const isCap = ticket.issueType === ISSUE_TYPES.STORY && proj.isCapitalizable;
                    if (!isCap) {
                        auditRows.push({
                            journalEntryId: entry.id,
                            jiraTicketId: ticket.id,
                            developerName: result.developerName,
                            ticketId: ticket.ticketId,
                            allocatedAmount: (ticket.storyPoints / Math.max(1, proj.points)) * (proj.points / Math.max(1, result.totalPoints)) * result.loadedCost,
                        });
                    }
                }
            }

            if (auditRows.length > 0) {
                await prisma.auditTrail.createMany({ data: auditRows });
            }
        }

        // ─── STEP 4: Ticket-level amortization ────────────────────────
        // Find ALL tickets that:
        //   - Have capitalized costs (capitalizedAmount > 0)
        //   - Were resolved BEFORE this period started (amortization has begun)
        // For each, compute the monthly amortization charge
        let totalAmortization = 0;

        const amortTickets = await prisma.jiraTicket.findMany({
            where: {
                capitalizedAmount: { gt: 0 },
                resolutionDate: { lt: startDate }, // resolved before this period → amortizing
            },
            include: { project: true },
        });

        // Aggregate monthly amortization by project, and track per-ticket details
        const projectAmortCharges: Record<string, {
            amount: number;
            projectName: string;
            ticketDetails: { ticketDbId: string; ticketId: string; monthlyAmort: number }[];
        }> = {};

        const asOfDate = new Date(year, month - 1, 15); // mid-month reference point
        for (const ticket of amortTickets) {
            const amort = calculateTicketAmortization(
                ticket.capitalizedAmount,
                ticket.amortizationMonths,
                ticket.resolutionDate!,
                asOfDate,
            );

            if (amort.monthlyAmortization > 0 && amort.nbv > 0) {
                const pid = ticket.projectId || 'unknown';
                if (!projectAmortCharges[pid]) {
                    projectAmortCharges[pid] = { amount: 0, projectName: ticket.project?.name || pid, ticketDetails: [] };
                }
                projectAmortCharges[pid].amount += amort.monthlyAmortization;
                projectAmortCharges[pid].ticketDetails.push({
                    ticketDbId: ticket.id,
                    ticketId: ticket.ticketId,
                    monthlyAmort: amort.monthlyAmortization,
                });
                totalAmortization += amort.monthlyAmortization;
            }
        }

        // Create one amortization journal entry per project with ticket-level audit trail
        for (const [projectId, { amount, projectName, ticketDetails }] of Object.entries(projectAmortCharges)) {
            if (amount > 0) {
                const entry = await prisma.journalEntry.create({
                    data: {
                        entryType: ENTRY_TYPES.AMORTIZATION,
                        debitAccount: ACCOUNTS.AMORTIZATION_EXPENSE,
                        creditAccount: ACCOUNTS.ACCUMULATED_AMORT,
                        amount,
                        description: `Monthly amortization for ${projectName} (ticket-level)`,
                        periodId: period.id,
                        projectId,
                    },
                });

                // Create audit trail records for each ticket's amortization contribution
                if (ticketDetails.length > 0) {
                    await prisma.auditTrail.createMany({
                        data: ticketDetails.map((td) => ({
                            journalEntryId: entry.id,
                            jiraTicketId: td.ticketDbId,
                            developerName: 'Amortization',
                            ticketId: td.ticketId,
                            allocatedAmount: td.monthlyAmort,
                        })),
                    });
                }
            }
        }

        // Update period totals
        await prisma.accountingPeriod.update({
            where: { id: period.id },
            data: { totalCapitalized, totalExpensed, totalAmortization },
        });

        return NextResponse.json({
            message: 'Journal entries generated',
            totalCapitalized,
            totalExpensed,
            totalAmortization,
        });
    } catch (error) {
        return handleApiError(error, 'Failed to generate journal entries');
    }
}

