/**
 * Shared Jira utilities — extracted to avoid duplication
 * across jira-sync and jira/preview routes.
 */

/**
 * Normalizes a Jira issue type string to our internal representation.
 * Handles common Jira synonyms (e.g., "User Story" → "STORY", "Defect" → "BUG").
 */
export function normalizeIssueType(jiraType: string): string {
    const t = jiraType.toUpperCase();
    if (t === 'STORY' || t === 'USER STORY') return 'STORY';
    if (t === 'BUG' || t === 'DEFECT') return 'BUG';
    if (t === 'EPIC') return 'EPIC';
    if (t === 'SUBTASK' || t === 'SUB-TASK') return 'SUBTASK';
    return 'TASK';
}
