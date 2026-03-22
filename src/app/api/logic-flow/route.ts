export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export interface FlowNode {
    id: string;
    type: 'source' | 'decision' | 'outcome' | 'process';
    label: string;
    description: string;
    phase: 'ingestion' | 'classification' | 'amortization';
    editable: boolean;
    // For decision nodes
    configKey?: string;       // GlobalConfig key this node controls
    currentValue?: string | boolean;
    options?: { label: string; value: string }[];
    // Live stats
    stats?: {
        ticketCount: number;
        dollarAmount: number;
    };
    // For connecting nodes
    yesTarget?: string;
    noTarget?: string;
    nextTarget?: string;
}

export interface FlowState {
    accountingStandard: string;
    rules: {
        priority: number;
        issueType: string;
        projectStatus: string;
        projectCapitalizable: boolean | null;
        action: string;
    }[];
    amortization: {
        defaultUsefulLife: number;
        method: string; // 'STRAIGHT_LINE'
    };
    nodes: FlowNode[];
    stats: {
        totalTicketsThisPeriod: number;
        capitalizedTickets: number;
        expensedTickets: number;
        amortizingTickets: number;
        capitalizedAmount: number;
        expensedAmount: number;
        amortizationAmount: number;
    };
}

export async function GET() {
    try {
        // Fetch all config in parallel
        const [standardConfig, rulesConfig, amortConfig, latestPeriod] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'ACCOUNTING_STANDARD' } }),
            prisma.globalConfig.findUnique({ where: { key: 'classification_rules' } }),
            prisma.globalConfig.findUnique({ where: { key: 'DEFAULT_AMORT_MONTHS' } }),
            prisma.accountingPeriod.findFirst({ orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
        ]);

        const accountingStandard = standardConfig?.value || 'ASC_350_40';
        const rules = rulesConfig ? JSON.parse(rulesConfig.value) : [
            { priority: 1, issueType: 'BUG', projectStatus: 'ANY', projectCapitalizable: null, action: 'EXPENSE' },
            { priority: 2, issueType: 'STORY', projectStatus: 'ANY', projectCapitalizable: true, action: 'CAPITALIZE' },
            { priority: 3, issueType: 'ANY', projectStatus: 'ANY', projectCapitalizable: null, action: 'EXPENSE' },
        ];
        const defaultUsefulLife = amortConfig ? parseInt(amortConfig.value) : 36;

        // Get live stats from the latest period
        let stats = {
            totalTicketsThisPeriod: 0,
            capitalizedTickets: 0,
            expensedTickets: 0,
            amortizingTickets: 0,
            capitalizedAmount: 0,
            expensedAmount: 0,
            amortizationAmount: 0,
        };

        if (latestPeriod) {
            const periodStart = new Date(latestPeriod.year, latestPeriod.month - 1, 1);
            const periodEnd = new Date(latestPeriod.year, latestPeriod.month, 0, 23, 59, 59);

            const [ticketCount, capitalizedTickets, amortizingTickets] = await Promise.all([
                prisma.jiraTicket.count({
                    where: {
                        OR: [
                            { resolutionDate: null },
                            { resolutionDate: { gte: periodStart, lte: periodEnd } },
                        ],
                    },
                }),
                prisma.auditTrail.count({
                    where: {
                        journalEntry: {
                            periodId: latestPeriod.id,
                            entryType: 'CAPITALIZATION',
                        },
                    },
                }),
                prisma.jiraTicket.count({
                    where: {
                        capitalizedAmount: { gt: 0 },
                        resolutionDate: { lt: periodStart },
                    },
                }),
            ]);

            stats = {
                totalTicketsThisPeriod: ticketCount,
                capitalizedTickets,
                expensedTickets: ticketCount - capitalizedTickets,
                amortizingTickets,
                capitalizedAmount: latestPeriod.totalCapitalized,
                expensedAmount: latestPeriod.totalExpensed,
                amortizationAmount: latestPeriod.totalAmortization,
            };
        }

        // Build flow nodes
        const nodes: FlowNode[] = [
            // ── Phase 1: Ingestion ──
            {
                id: 'jira_import',
                type: 'source',
                label: 'Jira Tickets',
                description: 'Tickets synced from Jira with issue type, story points, assignee, and project',
                phase: 'ingestion',
                editable: false,
                nextTarget: 'payroll_import',
                stats: { ticketCount: stats.totalTicketsThisPeriod, dollarAmount: 0 },
            },
            {
                id: 'payroll_import',
                type: 'source',
                label: 'Payroll Import',
                description: 'Monthly payroll data with gross salary per developer',
                phase: 'ingestion',
                editable: false,
                nextTarget: 'cost_loading',
            },
            {
                id: 'cost_loading',
                type: 'process',
                label: 'Fully Loaded Cost',
                description: 'Salary + Fringe Benefits + Stock-Based Compensation = Total Developer Cost',
                phase: 'ingestion',
                editable: false,
                nextTarget: 'sp_allocation',
            },
            {
                id: 'sp_allocation',
                type: 'process',
                label: 'Story Point Allocation',
                description: 'Each ticket gets a % of the developer\'s cost based on its story points relative to their total points that period',
                phase: 'ingestion',
                editable: false,
                nextTarget: 'check_capitalizable',
            },

            // ── Phase 2: Classification ──
            {
                id: 'check_capitalizable',
                type: 'decision',
                label: 'Is Project Capitalizable?',
                description: 'Projects flagged as capitalizable can have their STORY tickets capitalized',
                phase: 'classification',
                editable: false,
                configKey: 'project.isCapitalizable',
                currentValue: true,
                yesTarget: 'check_issue_type',
                noTarget: 'outcome_expense',
            },
            {
                id: 'check_issue_type',
                type: 'decision',
                label: 'Is Issue Type = STORY?',
                description: 'Only STORY tickets represent capitalizable development work. BUG fixes and TASKs are always expensed.',
                phase: 'classification',
                editable: true,
                configKey: 'capitalizableIssueTypes',
                currentValue: 'STORY',
                options: [
                    { label: 'STORY only', value: 'STORY' },
                    { label: 'STORY + TASK', value: 'STORY,TASK' },
                    { label: 'All types', value: 'ALL' },
                ],
                yesTarget: accountingStandard === 'ASU_2025_06' ? 'check_mgmt_auth' : 'outcome_capitalize',
                noTarget: 'outcome_expense',
            },
            // ASU 2025-06 extra gates
            ...(accountingStandard === 'ASU_2025_06' ? [
                {
                    id: 'check_mgmt_auth',
                    type: 'decision' as const,
                    label: 'Management Authorized?',
                    description: 'ASU 2025-06 requires management authorization before costs can be capitalized',
                    phase: 'classification' as const,
                    editable: false,
                    configKey: 'project.mgmtAuthorized',
                    currentValue: true,
                    yesTarget: 'check_probable',
                    noTarget: 'outcome_expense',
                },
                {
                    id: 'check_probable',
                    type: 'decision' as const,
                    label: 'Probable to Complete?',
                    description: 'ASU 2025-06 requires that the project is probable to be completed as intended',
                    phase: 'classification' as const,
                    editable: false,
                    configKey: 'project.probableToComplete',
                    currentValue: true,
                    yesTarget: 'outcome_capitalize',
                    noTarget: 'outcome_expense',
                },
            ] : []),

            // Outcome nodes
            {
                id: 'outcome_capitalize',
                type: 'outcome',
                label: 'CAPITALIZE',
                description: 'Cost added to WIP — Software Assets on the balance sheet',
                phase: 'classification',
                editable: false,
                nextTarget: 'check_resolved',
                stats: { ticketCount: stats.capitalizedTickets, dollarAmount: stats.capitalizedAmount },
            },
            {
                id: 'outcome_expense',
                type: 'outcome',
                label: 'EXPENSE',
                description: 'Cost recognized as R&D Expense on the income statement',
                phase: 'classification',
                editable: false,
                stats: { ticketCount: stats.expensedTickets, dollarAmount: stats.expensedAmount },
            },

            // ── Phase 3: Amortization ──
            {
                id: 'check_resolved',
                type: 'decision',
                label: 'Is Ticket Resolved?',
                description: 'Amortization can only begin after the ticket\'s work is complete (resolution date set)',
                phase: 'amortization',
                editable: false,
                yesTarget: 'check_project_live',
                noTarget: 'hold_on_bs',
            },
            {
                id: 'check_project_live',
                type: 'decision',
                label: 'Is Project LIVE?',
                description: 'Amortization starts only when the project has gone live. If the ticket is resolved but the project isn\'t live yet, the capitalized amount sits on the balance sheet.',
                phase: 'amortization',
                editable: false,
                yesTarget: 'amortize',
                noTarget: 'hold_on_bs',
            },
            {
                id: 'hold_on_bs',
                type: 'outcome',
                label: 'Hold on Balance Sheet',
                description: 'Capitalized cost remains as a WIP asset until both conditions are met',
                phase: 'amortization',
                editable: false,
            },
            {
                id: 'amortize',
                type: 'process',
                label: 'Amortize — Straight Line',
                description: `Capitalized cost is amortized over ${defaultUsefulLife} months starting the month after the ticket is resolved`,
                phase: 'amortization',
                editable: true,
                configKey: 'DEFAULT_AMORT_MONTHS',
                currentValue: String(defaultUsefulLife),
                options: [
                    { label: '24 months', value: '24' },
                    { label: '36 months', value: '36' },
                    { label: '48 months', value: '48' },
                    { label: '60 months', value: '60' },
                ],
                nextTarget: 'outcome_amortized',
                stats: { ticketCount: stats.amortizingTickets, dollarAmount: stats.amortizationAmount },
            },
            {
                id: 'outcome_amortized',
                type: 'outcome',
                label: 'AMORTIZATION EXPENSE',
                description: 'Monthly amortization charge recognized on the income statement; accumulated amortization reduces the asset on the balance sheet',
                phase: 'amortization',
                editable: false,
                stats: { ticketCount: stats.amortizingTickets, dollarAmount: stats.amortizationAmount },
            },
        ];

        const flowState: FlowState = {
            accountingStandard,
            rules,
            amortization: {
                defaultUsefulLife,
                method: 'STRAIGHT_LINE',
            },
            nodes,
            stats,
        };

        return NextResponse.json(flowState);
    } catch (error) {
        console.error('Logic flow error:', error);
        return NextResponse.json({ error: 'Failed to load logic flow' }, { status: 500 });
    }
}
