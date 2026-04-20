export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export interface Anomaly {
    id: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    type: string;
    title: string;
    description: string;
    affectedPeriod?: string;
    affectedProject?: string;
    affectedProjectId?: string;
    affectedAmount?: number;
    action: string;
    /** Per-type extra fields used by the inline Fix modal */
    fix?: {
        type: 'ASU_GAP';
        projectId: string;
        missingMgmtAuth: boolean;
        missingProbable: boolean;
    };
}

export async function GET() {
    try {
        const periods = await prisma.accountingPeriod.findMany({
            include: {
                journalEntries: {
                    include: {
                        project: true,
                        auditTrails: true,
                    },
                },
            },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
        });

        const anomalies: Anomaly[] = [];
        let anomalyIdCounter = 0;
        const nextId = () => `anom-${++anomalyIdCounter}`;

        // ── Compute trailing cap averages for spike detection ──────────────
        const periodCapAmounts: number[] = periods.map((p) => p.totalCapitalized);

        for (let i = 0; i < periods.length; i++) {
            const period = periods[i];
            const periodLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`;

            // 1. Capitalization spike: > 2× trailing 3-period average
            if (i >= 3) {
                const trailing3Avg = (periodCapAmounts[i - 1] + periodCapAmounts[i - 2] + periodCapAmounts[i - 3]) / 3;
                if (trailing3Avg > 0 && period.totalCapitalized > trailing3Avg * 2) {
                    anomalies.push({
                        id: nextId(),
                        severity: 'HIGH',
                        type: 'CAP_SPIKE',
                        title: 'Capitalization Spike Detected',
                        description: `${periodLabel} capitalized ${fmt(period.totalCapitalized)}, which is ${(period.totalCapitalized / trailing3Avg).toFixed(1)}× the trailing 3-period average of ${fmt(trailing3Avg)}. This may indicate a misclassification or a legitimate large project milestone requiring documentation.`,
                        affectedPeriod: periodLabel,
                        affectedAmount: period.totalCapitalized,
                        action: 'Review journal entries for this period and verify each project\'s classification rationale.',
                    });
                }
            }

            for (const entry of period.journalEntries) {
                const periodTotal = period.totalCapitalized + period.totalExpensed + period.totalAmortization;

                // Skip entries with no project (e.g. ADJUSTMENT entries)
                if (!entry.project) continue;
                if (periodTotal > 0 && entry.amount / periodTotal > 0.40 && entry.entryType !== 'AMORTIZATION') {
                    anomalies.push({
                        id: nextId(),
                        severity: 'MEDIUM',
                        type: 'LARGE_ENTRY',
                        title: 'Single Entry Dominates Period',
                        description: `${entry.project.name}'s ${entry.entryType.toLowerCase()} entry of ${fmt(entry.amount)} represents ${Math.round(entry.amount / periodTotal * 100)}% of the total ${periodLabel} activity (${fmt(periodTotal)}). Concentrated allocations may warrant additional review.`,
                        affectedPeriod: periodLabel,
                        affectedProject: entry.project.name,
                        affectedProjectId: entry.project.id,
                        affectedAmount: entry.amount,
                        action: 'Verify that the developer cost allocation and story point split are accurate for this project.',
                    });
                }

                // 3. Zero-ticket capitalization: capitalized entry with no audit trail
                if (entry.entryType === 'CAPITALIZATION' && entry.auditTrails.length === 0) {
                    anomalies.push({
                        id: nextId(),
                        severity: 'HIGH',
                        type: 'ZERO_TICKET_CAP',
                        title: 'Capitalized Entry Has No Supporting Tickets',
                        description: `${entry.project.name} has a capitalization entry of ${fmt(entry.amount)} in ${periodLabel} with zero linked Jira tickets in the audit trail. This will fail an auditor's substantiation test.`,
                        affectedPeriod: periodLabel,
                        affectedProject: entry.project.name,
                        affectedProjectId: entry.project.id,
                        affectedAmount: entry.amount,
                        action: 'Run Jira sync to ensure tickets are linked, or void this entry and regenerate the period.',
                    });
                }

                // 4. DEV project with no capitalization (only expenses)
                if (
                    entry.entryType === 'EXPENSE' &&
                    entry.project.status === 'DEV' &&
                    entry.project.isCapitalizable
                ) {
                    const hasCap = period.journalEntries.some(
                        (e) => e.projectId === entry.projectId && e.entryType === 'CAPITALIZATION'
                    );
                    if (!hasCap) {
                        anomalies.push({
                            id: nextId(),
                            severity: 'MEDIUM',
                            type: 'DEV_EXPENSE_ONLY',
                            title: 'Capitalizable DEV Project Has No Cap Entry',
                            description: `${entry.project.name} is in DEV status and marked capitalizable, but ${periodLabel} only contains expense entries (${fmt(entry.amount)}). Check whether story tickets were assigned to this project — or if the capitalization rule engine needs adjustment.`,
                            affectedPeriod: periodLabel,
                            affectedProject: entry.project.name,
                            affectedProjectId: entry.project.id,
                            affectedAmount: entry.amount,
                            action: 'Check classification rules and verify that STORY tickets exist for this project in this period.',
                        });
                    }
                }
            }
        }

        // 5. ASU 2025-06 compliance gap — projects being capitalized without both flags set
        const capProjects = await prisma.project.findMany({
            where: { isCapitalizable: true },
            include: { _count: { select: { journalEntries: true } } },
        });

        // Fix #16 — batch-fetch ALL cap entries for qualifying projects in one query
        // instead of firing one findMany per project inside the loop.
        const qualifyingProjectIds = capProjects
            .filter((p) => p._count.journalEntries > 0)
            .map((p) => p.id);

        const allCapEntries = qualifyingProjectIds.length > 0
            ? await prisma.journalEntry.findMany({
                where: { projectId: { in: qualifyingProjectIds }, entryType: 'CAPITALIZATION' },
                select: { projectId: true, amount: true },
            })
            : [];

        // Group totals by projectId in-memory
        const capTotalByProject = new Map<string, number>();
        for (const entry of allCapEntries) {
            if (!entry.projectId) continue;
            capTotalByProject.set(entry.projectId, (capTotalByProject.get(entry.projectId) ?? 0) + entry.amount);
        }

        for (const project of capProjects) {
            if (project._count.journalEntries === 0) continue;
            const missingFlags = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const proj = project as any;
            if (!proj.mgmtAuthorized) missingFlags.push('Management Authorization');
            if (!proj.probableToComplete) missingFlags.push('Probable to Complete');

            if (missingFlags.length > 0) {
                const totalCap = capTotalByProject.get(project.id) ?? 0;

                anomalies.push({
                    id: nextId(),
                    severity: missingFlags.length === 2 ? 'HIGH' : 'MEDIUM',
                    type: 'ASU_GAP',
                    title: `ASU 2025-06 Compliance Gap — ${project.name}`,
                    description: `${project.name} has capitalized ${fmt(totalCap)} in development costs but is missing required ASU 2025-06 criteria: ${missingFlags.join(' and ')}. Under the new standard (effective Dec 15, 2025), these costs may need to be expensed.`,
                    affectedProject: project.name,
                    affectedProjectId: project.id,
                    affectedAmount: totalCap,
                    action: `Navigate to the project detail page and enable ${missingFlags.join(' and ')} to satisfy ASU 2025-06 requirements.`,
                    fix: {
                        type: 'ASU_GAP',
                        projectId: project.id,
                        missingMgmtAuth: !proj.mgmtAuthorized,
                        missingProbable: !proj.probableToComplete,
                    },
                });
            }
        }


        // Sort: HIGH first, then MEDIUM, then LOW
        const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        anomalies.sort((a, b) => order[a.severity] - order[b.severity]);

        return NextResponse.json({ count: anomalies.length, anomalies });
    } catch (error) {
        console.error('Anomaly detection error:', error);
        return NextResponse.json({ error: 'Failed to run anomaly detection' }, { status: 500 });
    }
}
