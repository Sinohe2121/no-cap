import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface CapRule {
    priority: number;
    issueType: string;
    projectStatus: string;
    projectCapitalizable: boolean | null;
    action: string;
}

function getRationale(
    entryType: string,
    projectStatus: string,
    isCapitalizable: boolean,
    rules: CapRule[]
): string {
    if (entryType === 'AMORTIZATION') {
        return 'Project is in LIVE status — accumulated capitalized costs are being amortized over the useful life per ASC 350-40.';
    }
    for (const rule of rules) {
        const issueMatch = rule.issueType === 'ANY' || rule.issueType === 'STORY';
        const statusMatch = rule.projectStatus === 'ANY' || rule.projectStatus === projectStatus;
        const capMatch = rule.projectCapitalizable === null || rule.projectCapitalizable === isCapitalizable;
        if (issueMatch && statusMatch && capMatch) {
            return `Classified as ${rule.action} (rule priority ${rule.priority}): issue type matches "${rule.issueType}", project status is "${projectStatus}", capitalizable flag is ${isCapitalizable}.`;
        }
    }
    return 'Defaulted to EXPENSE — no matching classification rule found.';
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const month = parseInt(searchParams.get('month') || '0');
        const year = parseInt(searchParams.get('year') || '0');

        if (!month || !year) {
            return NextResponse.json({ error: 'month and year query params required' }, { status: 400 });
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
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!period) {
            return NextResponse.json({ error: 'Period not found' }, { status: 404 });
        }

        // Load classification rules
        const rulesConfig = await prisma.globalConfig.findUnique({ where: { key: 'classification_rules' } });
        const rules: CapRule[] = rulesConfig ? JSON.parse(rulesConfig.value) : [];

        // Build enriched pack
        const entries = period.journalEntries.map((entry) => {
            const devSummary: Record<string, { name: string; tickets: number; points: number; amount: number }> = {};
            for (const trail of entry.auditTrails) {
                if (!devSummary[trail.developerName]) {
                    devSummary[trail.developerName] = { name: trail.developerName, tickets: 0, points: 0, amount: 0 };
                }
                devSummary[trail.developerName].tickets += 1;
                devSummary[trail.developerName].points += trail.jiraTicket.storyPoints;
                devSummary[trail.developerName].amount += trail.allocatedAmount;
            }

            return {
                id: entry.id,
                entryType: entry.entryType,
                debitAccount: entry.debitAccount,
                creditAccount: entry.creditAccount,
                amount: entry.amount,
                description: entry.description,
                project: {
                    id: entry.project.id,
                    name: entry.project.name,
                    status: entry.project.status,
                    isCapitalizable: entry.project.isCapitalizable,
                    mgmtAuthorized: entry.project.mgmtAuthorized,
                    probableToComplete: entry.project.probableToComplete,
                },
                rationale: getRationale(
                    entry.entryType,
                    entry.project.status,
                    entry.project.isCapitalizable,
                    rules,
                ),
                developerSummary: Object.values(devSummary),
                auditTrailCount: entry.auditTrails.length,
                ticketIds: entry.auditTrails.map((t) => t.ticketId),
            };
        });

        const totalTickets = entries.reduce((s, e) => s + e.auditTrailCount, 0);
        const totalDevelopers = new Set(entries.flatMap((e) => e.developerSummary.map((d) => d.name))).size;

        return NextResponse.json({
            period: {
                id: period.id,
                month: period.month,
                year: period.year,
                status: period.status,
                totalCapitalized: period.totalCapitalized,
                totalExpensed: period.totalExpensed,
                totalAmortization: period.totalAmortization,
                grandTotal: period.totalCapitalized + period.totalExpensed + period.totalAmortization,
            },
            summary: {
                entryCount: entries.length,
                totalTickets,
                totalDevelopers,
                capitalizationRate: period.totalCapitalized + period.totalExpensed > 0
                    ? period.totalCapitalized / (period.totalCapitalized + period.totalExpensed)
                    : 0,
            },
            entries,
        });
    } catch (error) {
        console.error('Audit pack error:', error);
        return NextResponse.json({ error: 'Failed to generate audit pack' }, { status: 500 });
    }
}
