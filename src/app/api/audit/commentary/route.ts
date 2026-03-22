export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function generateCommentary(
    entryType: string,
    project: { name: string; status: string; isCapitalizable: boolean; mgmtAuthorized: boolean; probableToComplete: boolean },
    amount: number,
    developerCount: number,
    totalPoints: number,
    ticketCount: number,
    month: number,
    year: number,
    priorAmount: number | null
): string {
    const period = `${MONTH_NAMES[month - 1]} ${year}`;
    const changeDesc = priorAmount !== null
        ? priorAmount === 0
            ? ' (new this period)'
            : amount > priorAmount
                ? ` (↑${fmt(amount - priorAmount)} vs. prior period)`
                : amount < priorAmount
                    ? ` (↓${fmt(priorAmount - amount)} vs. prior period)`
                    : ' (unchanged from prior period)'
        : '';

    if (entryType === 'CAPITALIZATION') {
        const devStr = developerCount === 1 ? '1 developer' : `${developerCount} developers`;
        const ptStr = totalPoints === 1 ? '1 story point' : `${totalPoints} story points`;
        const asuNote = (project.mgmtAuthorized && project.probableToComplete)
            ? ' Both ASU 2025-06 criteria (management authorization and probable-to-complete) are satisfied.'
            : ' Note: This project does not yet satisfy all ASU 2025-06 capitalization criteria — review authorization status.';
        return `In ${period}, ${project.name} capitalized ${fmt(amount)}${changeDesc} representing engineering labor costs from ${devStr} across ${ticketCount} tickets (${ptStr} of story work). The project is in ${project.status} phase and is flagged as capitalizable per company policy.${asuNote} Debit: WIP Software Assets | Credit: R&D Salaries / Payroll Expense.`;
    }

    if (entryType === 'EXPENSE') {
        const devStr = developerCount === 1 ? '1 developer' : `${developerCount} developers`;
        const reason = !project.isCapitalizable
            ? 'the project is designated non-capitalizable'
            : project.status === 'PLANNING'
                ? 'the project is in the PLANNING phase (pre-technological feasibility)'
                : 'tickets are classified as bugs, tasks, or maintenance activity';
        return `In ${period}, ${project.name} expensed ${fmt(amount)}${changeDesc} in R&D costs from ${devStr} across ${ticketCount} tickets. These costs are expensed because ${reason}. Debit: R&D Expense — Software | Credit: Accrued Payroll / Cash.`;
    }

    if (entryType === 'AMORTIZATION') {
        return `In ${period}, ${project.name} recognized ${fmt(amount)}${changeDesc} in straight-line amortization expense. The project reached production in a prior period and is being amortized over its estimated useful life per ASC 350-40. Debit: Amortization Expense | Credit: Accumulated Amortization — Software.`;
    }

    return `${entryType} entry of ${fmt(amount)} recorded for ${project.name} in ${period}.`;
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
                        auditTrails: { include: { jiraTicket: true } },
                    },
                },
            },
        });

        if (!period) {
            return NextResponse.json({ error: 'Period not found' }, { status: 404 });
        }

        // Load prior period for comparisons
        const priorMonth = month === 1 ? 12 : month - 1;
        const priorYear = month === 1 ? year - 1 : year;
        const priorPeriod = await prisma.accountingPeriod.findUnique({
            where: { month_year: { month: priorMonth, year: priorYear } },
            include: { journalEntries: { include: { project: true } } },
        });

        const priorByProject: Record<string, Record<string, number>> = {};
        if (priorPeriod) {
            for (const e of priorPeriod.journalEntries) {
                if (!priorByProject[e.projectId]) priorByProject[e.projectId] = {};
                priorByProject[e.projectId][e.entryType] = (priorByProject[e.projectId][e.entryType] || 0) + e.amount;
            }
        }

        const commentary = period.journalEntries.map((entry) => {
            const devNames = new Set(entry.auditTrails.map((t) => t.developerName));
            const totalPoints = entry.auditTrails.reduce((s, t) => s + t.jiraTicket.storyPoints, 0);
            const priorAmount = priorByProject[entry.projectId]?.[entry.entryType] ?? null;

            return {
                entryId: entry.id,
                entryType: entry.entryType,
                projectName: entry.project.name,
                amount: entry.amount,
                commentary: generateCommentary(
                    entry.entryType,
                    entry.project,
                    entry.amount,
                    devNames.size,
                    totalPoints,
                    entry.auditTrails.length,
                    month,
                    year,
                    priorAmount,
                ),
            };
        });

        return NextResponse.json({ month, year, commentary });
    } catch (error) {
        console.error('Commentary error:', error);
        return NextResponse.json({ error: 'Failed to generate commentary' }, { status: 500 });
    }
}
