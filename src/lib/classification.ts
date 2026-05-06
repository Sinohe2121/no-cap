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
    { priority: 2, issueType: 'STORY', projectStatus: 'ANY', projectCapitalizable: true, action: 'CAPITALIZE' },
    { priority: 3, issueType: 'ANY',   projectStatus: 'ANY', projectCapitalizable: null, action: 'EXPENSE' },
];

export const ALL_PROJECT_STATUSES = ['PLANNING', 'DEV', 'LIVE', 'RETIRED'] as const;
export type ProjectStatus = typeof ALL_PROJECT_STATUSES[number];

/**
 * Default project statuses that are eligible for capitalization. The status
 * gate runs AFTER the priority-ordered rules: a ticket the rules say to
 * CAPITALIZE is downgraded to EXPENSE if the project's status is not in this
 * set. PLANNING and RETIRED are excluded by default — pre-feasibility and
 * post-decommission work is opex.
 */
export const DEFAULT_CAPITALIZABLE_STATUSES: ProjectStatus[] = ['DEV', 'LIVE'];

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

/**
 * Load the configured set of capitalizable project statuses from globalConfig.
 * Stored as a JSON array under the key `CAPITALIZABLE_STATUSES`. Returns the
 * default set when no row exists or the value is malformed.
 */
export async function loadCapitalizableStatuses(): Promise<ProjectStatus[]> {
    const cfg = await prisma.globalConfig.findUnique({ where: { key: 'CAPITALIZABLE_STATUSES' } });
    if (!cfg) return DEFAULT_CAPITALIZABLE_STATUSES;
    try {
        const parsed = JSON.parse(cfg.value);
        if (Array.isArray(parsed)) {
            const normalized = parsed
                .map((s) => String(s).toUpperCase())
                .filter((s): s is ProjectStatus => (ALL_PROJECT_STATUSES as readonly string[]).includes(s));
            return normalized;
        }
    } catch { /* fall through */ }
    return DEFAULT_CAPITALIZABLE_STATUSES;
}

interface TicketLike { issueType: string }
interface ProjectLike { status: string; isCapitalizable: boolean }

/**
 * Apply priority-ordered classification rules to a ticket+project pair, then
 * apply the status-eligibility gate.
 *
 * Rule matching — the first rule whose conditions all match wins:
 *   - issueType:           rule value 'ANY' or case-insensitive equality
 *   - projectStatus:       rule value 'ANY' or case-insensitive equality
 *   - projectCapitalizable: rule value null or strict equality with project flag
 *
 * Status gate — applied AFTER rule matching, can only DOWNGRADE CAPITALIZE → EXPENSE:
 *   - If `capitalizableStatuses` is provided and the project's status is not
 *     in the set, the result is forced to EXPENSE.
 *   - Configured at /admin/accounting-standard. Defaults to ['DEV', 'LIVE'].
 *
 * If no rule matches (or there are no rules at all), the ticket is EXPENSE.
 * Tickets with no project context are also EXPENSE.
 */
export function classifyTicket(
    rules: CapRule[],
    ticket: TicketLike,
    project: ProjectLike | null,
    capitalizableStatuses?: readonly string[],
): ClassificationAction {
    if (!project) return 'EXPENSE';

    const ticketType = (ticket.issueType || '').toUpperCase();
    const projStatus = (project.status || '').toUpperCase();
    const projCap = !!project.isCapitalizable;

    let decision: ClassificationAction = 'EXPENSE';
    for (const rule of rules) {
        const ruleType = (rule.issueType || 'ANY').toUpperCase();
        const ruleStatus = (rule.projectStatus || 'ANY').toUpperCase();

        if (ruleType !== 'ANY' && ruleType !== ticketType) continue;
        if (ruleStatus !== 'ANY' && ruleStatus !== projStatus) continue;
        if (rule.projectCapitalizable !== null && rule.projectCapitalizable !== projCap) continue;

        decision = rule.action === 'CAPITALIZE' ? 'CAPITALIZE' : 'EXPENSE';
        break;
    }

    if (decision === 'CAPITALIZE' && capitalizableStatuses) {
        const allowed = capitalizableStatuses.map((s) => s.toUpperCase());
        if (!allowed.includes(projStatus)) return 'EXPENSE';
    }

    return decision;
}
