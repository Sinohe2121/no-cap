export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { classifyTicket, loadClassificationRules } from '@/lib/classification';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * GET /api/wizard/period-projects?month=X&year=Y
 *
 * Returns every project that has tickets explicitly imported for the given
 * period, enriched with ticket-type counts and a per-ticket classification
 * preview under the active rules.
 *
 * Used by the Next Period Wizard's "Review Projects" step so users can
 * confirm project status / capitalizable / ASU flags before generating
 * journal entries.
 */
export async function GET(request: Request) {
    try {
        const auth = await requireAuth(request);
        if (auth instanceof NextResponse) return auth;

        const { searchParams } = new URL(request.url);
        const month = parseInt(searchParams.get('month') || '0', 10);
        const year = parseInt(searchParams.get('year') || '0', 10);
        if (!month || !year || month < 1 || month > 12) {
            return NextResponse.json({ error: 'Valid month and year are required' }, { status: 400 });
        }

        const periodStart = new Date(year, month - 1, 1);
        const periodEnd = new Date(year, month, 0, 23, 59, 59);

        const payrollImports = await prisma.payrollImport.findMany({
            where: { payDate: { gte: periodStart, lte: periodEnd } },
            select: { label: true },
        });
        const periodLabels = payrollImports.length > 0
            ? payrollImports.map((imp) => imp.label)
            : [`${MONTH_NAMES[month - 1]} ${year}`];

        // Tickets explicitly imported for this period.
        const tickets = await prisma.jiraTicket.findMany({
            where: {
                importPeriod: { in: periodLabels },
                projectId: { not: null },
            },
            select: {
                projectId: true,
                issueType: true,
                project: {
                    select: {
                        id: true,
                        name: true,
                        epicKey: true,
                        status: true,
                        isCapitalizable: true,
                        mgmtAuthorized: true,
                        probableToComplete: true,
                    },
                },
            },
        });

        const rules = await loadClassificationRules();

        // Group + classify in memory
        const byProject = new Map<string, {
            project: NonNullable<(typeof tickets)[number]['project']>;
            counts: { total: number; story: number; bug: number; task: number; epic: number; subtask: number; other: number };
            preview: { capitalize: number; expense: number };
        }>();

        for (const t of tickets) {
            if (!t.project || !t.projectId) continue;
            let agg = byProject.get(t.projectId);
            if (!agg) {
                agg = {
                    project: t.project,
                    counts: { total: 0, story: 0, bug: 0, task: 0, epic: 0, subtask: 0, other: 0 },
                    preview: { capitalize: 0, expense: 0 },
                };
                byProject.set(t.projectId, agg);
            }
            agg.counts.total += 1;
            const type = (t.issueType || '').toUpperCase();
            switch (type) {
                case 'STORY':   agg.counts.story += 1; break;
                case 'BUG':     agg.counts.bug += 1; break;
                case 'TASK':    agg.counts.task += 1; break;
                case 'EPIC':    agg.counts.epic += 1; break;
                case 'SUBTASK': agg.counts.subtask += 1; break;
                default:        agg.counts.other += 1;
            }
            const action = classifyTicket(rules, t, t.project);
            if (action === 'CAPITALIZE') agg.preview.capitalize += 1;
            else agg.preview.expense += 1;
        }

        const result = Array.from(byProject.values())
            .sort((a, b) => b.counts.total - a.counts.total);

        return NextResponse.json(result);
    } catch (error) {
        console.error('period-projects error:', error);
        return NextResponse.json({ error: 'Failed to load period projects' }, { status: 500 });
    }
}
