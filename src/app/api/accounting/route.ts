export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';
import { calculatePeriodCosts, calculateTicketAmortization, calculateAmortization } from '@/lib/calculations';
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
        const periodsWithComputedTotals = periods.map(p => {
            const totalCapitalized = p.journalEntries
                .filter(e => e.entryType === 'CAPITALIZATION')
                .reduce((s, e) => s + e.amount, 0);
            const totalExpensed = p.journalEntries
                .filter(e => ['EXPENSE', 'EXPENSE_BUG', 'EXPENSE_TASK'].includes(e.entryType))
                .reduce((s, e) => s + e.amount, 0);
            const totalAmortization = p.journalEntries
                .filter(e => e.entryType === 'AMORTIZATION')
                .reduce((s, e) => s + e.amount, 0);
            return { ...p, totalCapitalized, totalExpensed, totalAmortization };
        });
        return NextResponse.json(periodsWithComputedTotals);
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

        // ── CRITICAL: Batch reverse ticket-level allocatedAmount from previous generation ──
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

            // Batch fetch all tickets that need reversal — then run all updates in a single transaction
            const ticketIds = Object.keys(ticketReversal);
            if (ticketIds.length > 0) {
                const tickets = await prisma.jiraTicket.findMany({
                    where: { id: { in: ticketIds } },
                    select: { id: true, allocatedAmount: true },
                });

                // Single transaction = single DB connection, no pool exhaustion
                await prisma.$transaction(
                    tickets.map(ticket => {
                        const reverseAmt = ticketReversal[ticket.id] || 0;
                        const newAmount = Math.max(0, (ticket.allocatedAmount || 0) - reverseAmt);
                        return prisma.jiraTicket.update({
                            where: { id: ticket.id },
                            data: {
                                allocatedAmount: newAmount,
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
        let totalExpensedBugs = 0;
        let totalExpensedTasks = 0;
        let totalAdjustment = 0;
        let totalFullyLoadedPayroll = 0;

        // Aggregate costs by project, split by ticket type
        // projectCaps: capitalizable projects → CAPITALIZATION entries
        // projectBugExps: bug costs per project → EXPENSE_BUG entries
        // projectTaskExps: task/epic/subtask costs per project → EXPENSE_TASK entries
        const projectCaps: Record<string, number> = {};
        const projectBugExps: Record<string, number>  = {};
        const projectTaskExps: Record<string, number> = {};

        for (const result of costResults) {
            // Guard: skip if any key value is NaN (e.g. salary lookup failed)
            if (!isFinite(result.loadedCost) || !isFinite(result.netCost)) continue;

            totalCapitalized        += result.allocatedAmount;
            totalFullyLoadedPayroll += result.loadedCost;
            totalAdjustment         += result.meetingAdjustment;

            for (const proj of result.projectBreakdown) {
                if (proj.amount <= 0 || !isFinite(proj.amount)) continue;
                if (proj.isCapitalizable) {
                    projectCaps[proj.projectId] = (projectCaps[proj.projectId] || 0) + proj.amount;
                } else {
                    // Split non-cap amounts into bug vs task buckets
                    if (proj.bugAmount > 0 && isFinite(proj.bugAmount)) {
                        projectBugExps[proj.projectId]  = (projectBugExps[proj.projectId]  || 0) + proj.bugAmount;
                    }
                    if (proj.taskAmount > 0 && isFinite(proj.taskAmount)) {
                        projectTaskExps[proj.projectId] = (projectTaskExps[proj.projectId] || 0) + proj.taskAmount;
                    }
                    // Stories on non-capitalizable projects fall into taskAmount already
                    // because their isCapitalizable flag is false
                }
            }
        }

        // Batch-fetch all real projects (exclude the sentinel __UNALLOCATED__ key)
        const UNALLOCATED_KEY = '__UNALLOCATED__';
        const allProjectIds = Array.from(new Set([
            ...Object.keys(projectCaps).filter(id => id !== UNALLOCATED_KEY),
            ...Object.keys(projectBugExps).filter(id => id !== UNALLOCATED_KEY),
            ...Object.keys(projectTaskExps).filter(id => id !== UNALLOCATED_KEY),
        ]));

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

        // Load SP fallback values for Applied SP calculation
        const [bugSpRow, otherSpRow] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
            prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
        ]);
        const bugSpFallback   = parseFloat(bugSpRow?.value  ?? '1') || 1;
        const otherSpFallback = parseFloat(otherSpRow?.value ?? '1') || 1;

        /** Applied SP for a ticket: Jira value if > 0, else type-appropriate fallback */
        const appliedSP = (t: { storyPoints: number; issueType: string }) =>
            t.storyPoints > 0 ? t.storyPoints
            : t.issueType.toUpperCase() === 'BUG' ? bugSpFallback : otherSpFallback;


        // ─── STEP 2: Create capitalization entries + write to tickets ────
        // Collect ticket update data first — execute later sequentially, not in parallel
        const ticketUpdateData: {
            id: string;
            allocation: number;
            amortMonths: number;
            firstCapDate: Date | null;
        }[] = [];
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
                const capTickets = tickets.filter((t) => t.issueType.toUpperCase() === 'STORY');
                const localPoints = capTickets.reduce((s, t) => s + appliedSP(t), 0);

                for (const ticket of capTickets) {
                    const ticketAllocation = localPoints > 0
                        ? proj.amount * (appliedSP(ticket) / localPoints)
                        : 0;

                    auditRows.push({
                        journalEntryId: entry.id,
                        jiraTicketId: ticket.id,
                        developerName: result.developerName,
                        ticketId: ticket.ticketId,
                        allocatedAmount: ticketAllocation,
                    });

                    // Collect update data (don't execute yet)
                    ticketUpdateData.push({
                        id: ticket.id,
                        allocation: ticketAllocation,
                        amortMonths: projectAmortMap.get(projectId) ?? 36,
                        firstCapDate: ticket.firstCapitalizedDate ? null : startDate,
                    });
                }
            }

            if (auditRows.length > 0) {
                await prisma.auditTrail.createMany({ data: auditRows });
            }

            projectAccIncrements[projectId] = (projectAccIncrements[projectId] || 0) + amount;
        }

        // Execute ticket updates sequentially — one DB connection at a time
        for (const upd of ticketUpdateData) {
            await prisma.jiraTicket.update({
                where: { id: upd.id },
                data: {
                    allocatedAmount: { increment: upd.allocation },
                    amortizationMonths: upd.amortMonths,
                    ...(upd.firstCapDate ? { firstCapitalizedDate: upd.firstCapDate } : {}),
                },
            });
        }

        // Execute project accumulatedCost updates sequentially
        for (const [pid, amt] of Object.entries(projectAccIncrements)) {
            await prisma.project.update({ where: { id: pid }, data: { accumulatedCost: { increment: amt } } });
        }

        // ─── STEP 3: Create expense entries per project (split by type) ────
        // EXPENSE_BUG — bug tickets on any project
        for (const [projectId, amount] of Object.entries(projectBugExps)) {
            if (amount <= 0) continue;
            if (projectId === UNALLOCATED_KEY) continue; // bugs in unallocated bucket are rare; they fold into EXPENSE_TASK
            totalExpensedBugs += amount;
            const entry = await prisma.journalEntry.create({
                data: {
                    entryType: ENTRY_TYPES.EXPENSE_BUG,
                    debitAccount: ACCOUNTS.RD_EXPENSE_SOFTWARE,
                    creditAccount: ACCOUNTS.ACCRUED_PAYROLL,
                    amount,
                    description: `Bug/defect costs — ${projectNameMap.get(projectId) ?? projectId}`,
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
                    (p) => p.projectId === projectId && !p.isCapitalizable && p.bugAmount > 0
                );
                if (!proj) continue;

                const tickets = ticketLookup.get(`${projectId}::${result.developerId}`) ?? [];
                const bugTickets = tickets.filter(t => t.issueType.toUpperCase() === 'BUG');
                const bugLocalPoints = bugTickets.reduce((s, t) => s + appliedSP(t), 0);

                for (const ticket of bugTickets) {
                    auditRows.push({
                        journalEntryId: entry.id,
                        jiraTicketId: ticket.id,
                        developerName: result.developerName,
                        ticketId: ticket.ticketId,
                        allocatedAmount: bugLocalPoints > 0
                            ? proj.bugAmount * (appliedSP(ticket) / bugLocalPoints)
                            : 0,
                    });
                }
            }

            if (auditRows.length > 0) {
                await prisma.auditTrail.createMany({ data: auditRows });
            }
        }

        // EXPENSE_TASK — task/epic/subtask tickets on non-capitalizable projects
        // Also includes the __UNALLOCATED__ bucket (devs with no tickets, or tickets with no project)
        for (const [projectId, amount] of Object.entries(projectTaskExps)) {
            if (amount <= 0) continue;
            const isUnallocated = projectId === UNALLOCATED_KEY;
            const realProjectId = isUnallocated ? null : projectId;
            totalExpensedTasks += amount;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const entry = await prisma.journalEntry.create({
                data: {
                    entryType: ENTRY_TYPES.EXPENSE_TASK,
                    debitAccount: ACCOUNTS.RD_EXPENSE_SOFTWARE,
                    creditAccount: ACCOUNTS.ACCRUED_PAYROLL,
                    amount,
                    description: isUnallocated
                        ? `Unallocated labor — developers with no ticket assignments`
                        : `Task/overhead costs — ${projectNameMap.get(projectId) ?? projectId}`,
                    periodId: period.id,
                    projectId: isUnallocated ? null : projectId,
                } as any,
            });

            if (!isUnallocated) {
                const auditRows: {
                    journalEntryId: string;
                    jiraTicketId: string;
                    developerName: string;
                    ticketId: string;
                    allocatedAmount: number;
                }[] = [];

                for (const result of costResults) {
                    const proj = result.projectBreakdown.find(
                        (p) => p.projectId === projectId && !p.isCapitalizable && p.taskAmount > 0
                    );
                    if (!proj) continue;

                    const tickets = ticketLookup.get(`${projectId}::${result.developerId}`) ?? [];
                    const taskTickets = tickets.filter(t => t.issueType.toUpperCase() !== 'BUG');
                    const taskLocalPoints = taskTickets.reduce((s, t) => s + appliedSP(t), 0);

                    for (const ticket of taskTickets) {
                        auditRows.push({
                            journalEntryId: entry.id,
                            jiraTicketId: ticket.id,
                            developerName: result.developerName,
                            ticketId: ticket.ticketId,
                            allocatedAmount: taskLocalPoints > 0
                                ? proj.taskAmount * (appliedSP(ticket) / taskLocalPoints)
                                : 0,
                        });
                    }
                }

                if (auditRows.length > 0) {
                    await prisma.auditTrail.createMany({ data: auditRows });
                }
            }
        }

        // ─── STEP 3b: ADJUSTMENT entry for meeting-time overhead ─────────
        // totalAdjustment = Σ(loadedCost × meetingTimeRate) across all developers
        // DR: Payroll Expense — Overhead / Meetings
        // CR: Accrued Payroll / Cash
        if (totalAdjustment > 0) {
            await prisma.journalEntry.create({
                data: {
                    entryType: ENTRY_TYPES.ADJUSTMENT,
                    debitAccount: ACCOUNTS.OVERHEAD_PAYROLL,
                    creditAccount: ACCOUNTS.ACCRUED_PAYROLL,
                    amount: totalAdjustment,
                    description: `Meeting-time / overhead adjustment — ${year}-${String(month).padStart(2, '0')}`,
                    periodId: period.id,
                    projectId: null,
                },
            });
        }


        // ─── STEP 4: Ticket-level amortization ────────────────────────
        // Find ALL tickets that:
        //   - Have capitalized costs (allocatedAmount > 0)
        //   - Were resolved BEFORE this period started (amortization has begun)
        // For each, compute the monthly amortization charge
        let totalAmortization = 0;

        const amortTickets = await prisma.jiraTicket.findMany({
            where: {
                allocatedAmount: { gt: 0 },
                resolutionDate: { lt: startDate }, // resolved before this period → amortizing
                // Bugs are never capitalized → never amortized
                issueType: { not: 'BUG' },
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
                ticket.allocatedAmount,
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
        // ─── STEP 5: Legacy / project-level amortization ─────────────────
        // Projects with startingBalance (legacy assets) that amortize at the
        // project level rather than ticket level.
        const legacyProjects = await prisma.project.findMany({
            where: {
                startingBalance: { gt: 0 },
                launchDate: { not: null },
                amortizationMonths: { gt: 0 },
            },
        });

        for (const project of legacyProjects) {
            // Skip if this project already had ticket-level amort entries
            if (projectAmortCharges[project.id]) continue;

            const amort = calculateAmortization(
                project.accumulatedCost,
                project.startingBalance,
                project.startingAmortization,
                project.amortizationMonths,
                project.launchDate,
                asOfDate,
            );

            if (amort.monthlyAmortization > 0 && amort.netBookValue > 0) {
                totalAmortization += amort.monthlyAmortization;

                await prisma.journalEntry.create({
                    data: {
                        entryType: ENTRY_TYPES.AMORTIZATION,
                        debitAccount: ACCOUNTS.AMORTIZATION_EXPENSE,
                        creditAccount: ACCOUNTS.ACCUMULATED_AMORT,
                        amount: amort.monthlyAmortization,
                        description: `Monthly amortization for ${project.name} (legacy asset)`,
                        periodId: period.id,
                        projectId: project.id,
                    },
                });
            }
        }

        // Update period totals
        const totalExpensed = totalExpensedBugs + totalExpensedTasks;
        await prisma.accountingPeriod.update({
            where: { id: period.id },
            data: { totalCapitalized, totalExpensed, totalAmortization },
        });

        // Fetch the newly created entries for the variance comparison
        const newEntries = await prisma.journalEntry.findMany({
            where: { periodId: period.id },
            include: { project: { select: { id: true, name: true } } },
            orderBy: { entryType: 'asc' },
        });

        // Control delta: fully loaded payroll − (cap + exp_bug + exp_task + adjustment)
        // D&A excluded — it's a non-cash charge sourced from prior-period capitalizations
        const controlDelta = totalFullyLoadedPayroll - (totalCapitalized + totalExpensedBugs + totalExpensedTasks + totalAdjustment);

        return NextResponse.json({
            message: 'Journal entries generated',
            totalCapitalized,
            totalExpensed,
            totalExpensedBugs,
            totalExpensedTasks,
            totalAdjustment,
            totalAmortization,
            totalFullyLoadedPayroll,
            controlDelta,
            entries: newEntries.map(e => ({
                entryType: e.entryType,
                amount: e.amount,
                projectName: e.project?.name || (e.entryType === ENTRY_TYPES.ADJUSTMENT ? 'Period Adjustment' : 'Unknown'),
                projectId: e.projectId,
                description: e.description,
            })),
        });
    } catch (error) {
        return handleApiError(error, 'Failed to generate journal entries');
    }
}

