export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateAmortization } from '@/lib/calculations';
import { ENTRY_TYPES } from '@/lib/constants';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const entry = await prisma.journalEntry.findUnique({
            where: { id: params.id },
            include: {
                project: true,
                period: true,
                auditTrails: {
                    include: { jiraTicket: true },
                    orderBy: { allocatedAmount: 'desc' },
                },
            },
        });

        if (!entry) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        // Build enriched response based on entry type
        const enriched: Record<string, unknown> = {
            id: entry.id,
            entryType: entry.entryType,
            debitAccount: entry.debitAccount,
            creditAccount: entry.creditAccount,
            amount: entry.amount,
            description: entry.description,
            project: entry.project ? { id: entry.project.id, name: entry.project.name, status: entry.project.status } : null,
            period: { month: entry.period.month, year: entry.period.year },
            auditTrails: entry.auditTrails,
        };

        // For amortization, add schedule details
        if (entry.entryType === ENTRY_TYPES.AMORTIZATION) {
            const project = entry.project;
            if (project && project.launchDate) {
                const amort = calculateAmortization(
                    project.accumulatedCost,
                    project.startingBalance,
                    project.startingAmortization,
                    project.amortizationMonths,
                    project.launchDate,
                    new Date(entry.period.year, entry.period.month - 1, 15),
                );
                enriched.amortizationDetails = {
                    totalCostBasis: project.accumulatedCost + project.startingBalance,
                    accumulatedCost: project.accumulatedCost,
                    startingBalance: project.startingBalance,
                    startingAmortization: project.startingAmortization,
                    usefulLifeMonths: project.amortizationMonths,
                    monthlyRate: amort.monthlyAmortization,
                    monthsElapsed: amort.monthsElapsed,
                    totalAmortization: amort.totalAmortization,
                    netBookValue: amort.netBookValue,
                    launchDate: project.launchDate,
                };
            }
        }

        // For capitalization or expense entries, get developer cost breakdown
        if ((['CAPITALIZATION', 'EXPENSE', 'EXPENSE_BUG', 'EXPENSE_TASK'] as string[]).includes(entry.entryType)) {
            // Summarize by developer from audit trails
            const devSummary: Record<string, { name: string; ticketCount: number; totalPoints: number; totalAmount: number }> = {};
            for (const trail of entry.auditTrails) {
                if (!devSummary[trail.developerName]) {
                    devSummary[trail.developerName] = { name: trail.developerName, ticketCount: 0, totalPoints: 0, totalAmount: 0 };
                }
                devSummary[trail.developerName].ticketCount += 1;
                devSummary[trail.developerName].totalPoints += trail.jiraTicket.storyPoints;
                devSummary[trail.developerName].totalAmount += trail.allocatedAmount;
            }
            enriched.developerSummary = Object.values(devSummary);
        }

        return NextResponse.json(enriched);
    } catch (error) {
        console.error('Audit trail error:', error);
        return NextResponse.json({ error: 'Failed to load audit trail' }, { status: 500 });
    }
}
