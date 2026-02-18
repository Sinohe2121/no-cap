import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculatePeriodCosts, calculateAmortization } from '@/lib/calculations';

export async function GET() {
    try {
        const periods = await prisma.accountingPeriod.findMany({
            include: { journalEntries: { include: { project: true } } },
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
        });

        return NextResponse.json(periods);
    } catch (error) {
        console.error('Accounting API error:', error);
        return NextResponse.json({ error: 'Failed to load accounting data' }, { status: 500 });
    }
}

// Generate journal entries for a given period
export async function POST(request: Request) {
    try {
        const { month, year } = await request.json();

        // Find or create the accounting period
        let period = await prisma.accountingPeriod.findUnique({
            where: { month_year: { month, year } },
        });

        if (!period) {
            period = await prisma.accountingPeriod.create({
                data: { month, year, status: 'OPEN' },
            });
        }

        // Delete existing journal entries for this period to recalculate
        await prisma.journalEntry.deleteMany({ where: { periodId: period.id } });

        // Calculate developer-level costs
        const costResults = await calculatePeriodCosts(month, year);

        let totalCapitalized = 0;
        let totalExpensed = 0;

        // Create capitalization journal entries per project
        const projectCaps: Record<string, number> = {};

        for (const result of costResults) {
            totalCapitalized += result.capitalizedAmount;
            totalExpensed += result.expensedAmount;

            for (const proj of result.projectBreakdown) {
                if (proj.isCapitalizable && proj.amount > 0) {
                    projectCaps[proj.projectId] = (projectCaps[proj.projectId] || 0) + proj.amount;
                }
            }
        }

        // Create capitalization entries
        for (const [projectId, amount] of Object.entries(projectCaps)) {
            const project = await prisma.project.findUnique({ where: { id: projectId } });

            const entry = await prisma.journalEntry.create({
                data: {
                    entryType: 'CAPITALIZATION',
                    debitAccount: 'WIP — Software Assets',
                    creditAccount: 'R&D Salaries / Payroll Expense',
                    amount,
                    description: `Capitalize ${project?.name} development costs`,
                    periodId: period.id,
                    projectId,
                },
            });

            // Create audit trail records
            for (const result of costResults) {
                for (const proj of result.projectBreakdown) {
                    if (proj.projectId === projectId && proj.isCapitalizable && proj.amount > 0) {
                        // Find the developer's tickets for this project in this period
                        const startDate = new Date(year, month - 1, 1);
                        const endDate = new Date(year, month, 0, 23, 59, 59);
                        const tickets = await prisma.jiraTicket.findMany({
                            where: {
                                projectId,
                                assigneeId: result.developerId,
                                resolutionDate: { gte: startDate, lte: endDate },
                                issueType: 'STORY',
                            },
                        });

                        for (const ticket of tickets) {
                            await prisma.auditTrail.create({
                                data: {
                                    journalEntryId: entry.id,
                                    jiraTicketId: ticket.id,
                                    developerName: result.developerName,
                                    ticketId: ticket.ticketId,
                                    allocatedAmount: proj.amount * (ticket.storyPoints / proj.points),
                                },
                            });
                        }
                    }
                }
            }

            // Update project accumulated cost
            await prisma.project.update({
                where: { id: projectId },
                data: { accumulatedCost: { increment: amount } },
            });
        }

        // Create expense entries per project (non-capitalizable portion)
        const projectExps: Record<string, number> = {};
        for (const result of costResults) {
            for (const proj of result.projectBreakdown) {
                if (!proj.isCapitalizable && proj.points > 0) {
                    const expAmount = (proj.points / result.totalPoints) * result.loadedCost;
                    projectExps[proj.projectId] = (projectExps[proj.projectId] || 0) + expAmount;
                }
            }
        }

        for (const [projectId, amount] of Object.entries(projectExps)) {
            const project = await prisma.project.findUnique({ where: { id: projectId } });

            const entry = await prisma.journalEntry.create({
                data: {
                    entryType: 'EXPENSE',
                    debitAccount: 'R&D Expense — Software',
                    creditAccount: 'Accrued Payroll / Cash',
                    amount,
                    description: `Expense ${project?.name} non-capitalizable costs`,
                    periodId: period.id,
                    projectId,
                },
            });

            // Create audit trail records for expensed tickets
            for (const result of costResults) {
                for (const proj of result.projectBreakdown) {
                    if (proj.projectId === projectId && !proj.isCapitalizable && proj.points > 0) {
                        const startDate = new Date(year, month - 1, 1);
                        const endDate = new Date(year, month, 0, 23, 59, 59);
                        const tickets = await prisma.jiraTicket.findMany({
                            where: {
                                projectId,
                                assigneeId: result.developerId,
                                resolutionDate: { gte: startDate, lte: endDate },
                            },
                        });

                        for (const ticket of tickets) {
                            // Only include non-capitalizable tickets
                            const isCap = ticket.issueType === 'STORY' && proj.isCapitalizable;
                            if (!isCap) {
                                await prisma.auditTrail.create({
                                    data: {
                                        journalEntryId: entry.id,
                                        jiraTicketId: ticket.id,
                                        developerName: result.developerName,
                                        ticketId: ticket.ticketId,
                                        allocatedAmount: (ticket.storyPoints / proj.points) * (proj.points / result.totalPoints) * result.loadedCost,
                                    },
                                });
                            }
                        }
                    }
                }
            }
        }

        // Create amortization entries for live projects
        let totalAmortization = 0;
        const liveProjects = await prisma.project.findMany({
            where: { status: 'LIVE', launchDate: { not: null } },
        });

        for (const project of liveProjects) {
            const amort = calculateAmortization(
                project.accumulatedCost,
                project.startingBalance,
                project.startingAmortization,
                project.amortizationMonths,
                project.launchDate,
                new Date(year, month - 1, 15),
            );

            if (amort.monthlyAmortization > 0) {
                await prisma.journalEntry.create({
                    data: {
                        entryType: 'AMORTIZATION',
                        debitAccount: 'Amortization Expense',
                        creditAccount: 'Accumulated Amortization — Software',
                        amount: amort.monthlyAmortization,
                        description: `Monthly amortization for ${project.name}`,
                        periodId: period.id,
                        projectId: project.id,
                    },
                });
                totalAmortization += amort.monthlyAmortization;
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
        console.error('Journal entry generation error:', error);
        return NextResponse.json({ error: 'Failed to generate entries' }, { status: 500 });
    }
}
