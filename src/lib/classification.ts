import prisma from '@/lib/prisma';

export interface CapRule {
    priority: number;
    issueType: string;        // STORY | BUG | TASK | EPIC | SUBTASK | ANY
    projectStatus: string;    // PLANNING | DEV | LIVE | RETIRED | ANY
    projectCapitalizable: boolean | null;
    action: string;           // CAPITALIZE | EXPENSE
}

export type ClassificationAction = 'CAPITALIZE' | 'EXPENSE';

export const DEFAULT_RULES: CapRule[] = [
    { priority: 1, issueType: 'BUG',   projectStatus: 'ANY', projectCapitalizable: null, action: 'EXPENSE' },
    { priority: 2, issueType: 'STORY', projectStatus: 'DEV', projectCapitalizable: true, action: 'CAPITALIZE' },
    { priority: 3, issueType: 'ANY',   projectStatus: 'ANY', projectCapitalizable: null, action: 'EXPENSE' },
];

/**
 * Load classification rules from globalConfig, sorted by priority ascending.
 * Falls back to DEFAULT_RULES when no row exists or the value is malformed.
 */
export async function loadClassificationRules(): Promise<CapRule[]> {
    const cfg = await prisma.globalConfig.findUnique({ where: { key: 'classification_rules' } });
    if (!cfg) return DEFAULT_RULES;
    try {
        const parsed = JSON.parse(cfg.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return [...parsed].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        }
    } catch { /* fall through */ }
    return DEFAULT_RULES;
}

interface TicketLike { issueType: string }
interface ProjectLike { status: string; isCapitalizable: boolean }

/**
 * Apply priority-ordered classification rules to a ticket+project pair.
 *
 * The first rule whose conditions all match wins. Conditions:
 *   - issueType:           rule value 'ANY' or case-insensitive equality
 *   - projectStatus:       rule value 'ANY' or case-insensitive equality
 *   - projectCapitalizable: rule value null or strict equality with project flag
 *
 * If no rule matches (or there are no rules at all), the ticket is EXPENSE.
 * Tickets with no project context are also EXPENSE.
 */
export function classifyTicket(
    rules: CapRule[],
    ticket: TicketLike,
    project: ProjectLike | null,
): ClassificationAction {
    if (!project) return 'EXPENSE';

    const ticketType = (ticket.issueType || '').toUpperCase();
    const projStatus = (project.status || '').toUpperCase();
    const projCap = !!project.isCapitalizable;

    for (const rule of rules) {
        const ruleType = (rule.issueType || 'ANY').toUpperCase();
        const ruleStatus = (rule.projectStatus || 'ANY').toUpperCase();

        if (ruleType !== 'ANY' && ruleType !== ticketType) continue;
        if (ruleStatus !== 'ANY' && ruleStatus !== projStatus) continue;
        if (rule.projectCapitalizable !== null && rule.projectCapitalizable !== projCap) continue;

        return rule.action === 'CAPITALIZE' ? 'CAPITALIZE' : 'EXPENSE';
    }
    return 'EXPENSE';
}
