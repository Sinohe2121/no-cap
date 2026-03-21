import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { normalizeIssueType } from '@/lib/jiraUtils';

interface JiraIssue {
    key: string;
    fields: {
        summary: string;
        issuetype: { name: string };
        assignee: { accountId: string; displayName: string } | null;
        story_points?: number;
        customfield_10014?: number; // story points (classic)
        customfield_10016?: number; // story points (next-gen)
        customfield_10028?: number; // story points (some configs)
        resolutiondate: string | null;
        fixVersions: { name: string }[];
        parent?: { key: string; fields?: { issuetype?: { name: string } } };
    };
}

interface JiraSearchResponse {
    issues: JiraIssue[];
    total: number;
    startAt: number;
    maxResults: number;
    nextPageToken?: string;
}

function extractStoryPoints(fields: JiraIssue['fields']): number {
    return (
        fields.customfield_10016 ??
        fields.customfield_10014 ??
        fields.customfield_10028 ??
        0
    );
}



// GET — return last sync time
export async function GET() {
    try {
        const lastSyncRow = await prisma.globalConfig.findUnique({ where: { key: 'jira_last_sync' } });
        return NextResponse.json({ lastSync: lastSyncRow?.value ?? null });
    } catch {
        return NextResponse.json({ lastSync: null });
    }
}

// POST — run real sync from Jira
export async function POST(req: Request) {
    try {
        const rbac = await requireAdmin(req);
        if (rbac instanceof NextResponse) return rbac;

        // Load credentials
        const rows = await prisma.globalConfig.findMany({
            where: { key: { in: ['jira_host', 'jira_user_email', 'jira_api_token', 'jira_project_keys', 'jira_sync_days', 'jira_custom_fields'] } },
        });
        const cfg: Record<string, string> = {};
        for (const r of rows) cfg[r.key] = r.value;

        // Validate required config
        if (!cfg.jira_host || !cfg.jira_user_email || !cfg.jira_api_token) {
            return NextResponse.json({
                error: 'Jira is not configured. Please set your Host, Email, and API Token in the Integrations page.',
                configRequired: true,
            }, { status: 400 });
        }

        // Fix #5 — validate projectKey format to prevent JQL injection.
        // Jira project keys are 1–10 uppercase alphanumeric chars, starting with a letter.
        const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]{0,9}$/;
        const rawKeys = (cfg.jira_project_keys || '')
            .split(',')
            .map((k) => k.trim().toUpperCase())
            .filter(Boolean);

        const projectKeys = rawKeys.filter((k) => {
            if (!JIRA_KEY_RE.test(k)) {
                console.warn(`Skipping invalid Jira project key (potential injection): "${k}"`);
                return false;
            }
            return true;
        });

        if (projectKeys.length === 0) {
            return NextResponse.json({ error: 'No valid Jira project keys configured.' }, { status: 400 });
        }

        const syncDays = parseInt(cfg.jira_sync_days || '90', 10);
        const host = cfg.jira_host.replace(/\/$/, '');
        const auth = Buffer.from(`${cfg.jira_user_email}:${cfg.jira_api_token}`).toString('base64');
        const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };

        let extraFields: { id: string; name: string }[] = [];
        try { 
            const parsed = JSON.parse(cfg.jira_custom_fields || '[]'); 
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
                extraFields = parsed.map((id: string) => ({ id, name: id }));
            } else {
                extraFields = parsed;
            }
        } catch {}

        // Load all developers and projects for matching
        const developers = await prisma.developer.findMany({ select: { id: true, jiraUserId: true } });
        const devMap = new Map(developers.map((d) => [d.jiraUserId.toLowerCase(), d.id]));

        const projects = await prisma.project.findMany({ select: { id: true, epicKey: true } });
        const projMap = new Map(projects.map((p) => [p.epicKey.toUpperCase(), p.id]));

        let totalSynced = 0;
        let totalSkipped = 0;
        let totalErrors = 0;
        const syncedByProject: Record<string, number> = {};
        // Fix #19 — track unmatched accountIds so admins can map them
        const unmatchedAccountIds = new Set<string>();

        for (const projectKey of projectKeys) {
            const projectId = projMap.get(projectKey);
            if (!projectId) {
                console.warn(`No local project found for Jira key: ${projectKey}`);
                continue;
            }

            // Fetch all resolved issues for this project in the sync window
            // Use pagination to handle large projects
            let nextPageToken: string | undefined = undefined;
            let hasMore = true;
            let projectCount = 0;

            while (hasMore) {
                const jqlString = `project = "${projectKey}" AND statusCategory = Done AND resolutiondate >= -${syncDays}d ORDER BY resolutiondate DESC`;
                const baseFields = ['summary','issuetype','assignee','customfield_10014','customfield_10016','customfield_10028','resolutiondate','fixVersions','parent'];
                const fields = Array.from(new Set([...baseFields, ...extraFields.map(f => f.id)]));

                const url = `${host}/rest/api/3/search/jql`;
                
                const bodyPayload: any = {
                    jql: jqlString,
                    maxResults: 100,
                    fields: fields
                };
                if (nextPageToken) {
                    bodyPayload.nextPageToken = nextPageToken;
                }

                const res = await fetch(url, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyPayload)
                });

                if (!res.ok) {
                    const errBody = await res.text();
                    console.error(`Jira search failed for ${projectKey}:`, res.status, errBody);
                    totalErrors++;
                    break;
                }

                const data = await res.json() as JiraSearchResponse;
                const issues = data.issues || [];

                for (const issue of issues) {
                    const issueKey = issue.key; // e.g. "NC-123"
                    const assigneeAccountId = issue.fields.assignee?.accountId?.toLowerCase();

                    // Match assignee to local developer
                    const devId = assigneeAccountId ? devMap.get(assigneeAccountId) : null;
                    if (!devId) {
                        // No matching developer — skip but record accountId for reporting
                        if (assigneeAccountId) unmatchedAccountIds.add(assigneeAccountId);
                        totalSkipped++;
                        continue;
                    }

                    const storyPoints = extractStoryPoints(issue.fields);
                    const issueType = normalizeIssueType(issue.fields.issuetype.name);
                    const resolutionDate = issue.fields.resolutiondate
                        ? new Date(issue.fields.resolutiondate)
                        : null;
                    const fixVersion = issue.fields.fixVersions?.[0]?.name ?? null;

                    const customFieldsObj: Record<string, string> = {};
                    for (const f of extraFields) {
                        const val = (issue.fields as any)[f.id];
                        if (val != null) {
                            if (typeof val === 'object') {
                                if (Array.isArray(val)) {
                                    customFieldsObj[f.name] = val.map((v: any) => typeof v === 'object' ? (v.name || v.value || JSON.stringify(v)) : String(v)).join(', ');
                                } else {
                                    customFieldsObj[f.name] = val.name || val.value || JSON.stringify(val);
                                }
                            } else { customFieldsObj[f.name] = String(val); }
                        }
                    }

                    try {
                        await prisma.jiraTicket.upsert({
                            where: { ticketId: issueKey },
                            update: {
                                summary: issue.fields.summary,
                                issueType,
                                storyPoints,
                                resolutionDate,
                                fixVersion,
                                assigneeId: devId,
                                projectId,
                                epicKey: projectKey,
                                customFields: customFieldsObj,
                            },
                            create: {
                                ticketId: issueKey,
                                epicKey: projectKey,
                                issueType,
                                summary: issue.fields.summary,
                                storyPoints,
                                resolutionDate,
                                fixVersion,
                                assigneeId: devId,
                                projectId,
                                customFields: customFieldsObj,
                            },
                        });
                        projectCount++;
                        totalSynced++;
                    } catch (err) {
                        console.error(`Failed to upsert ticket ${issueKey}:`, err);
                        totalErrors++;
                    }
                }

                // Pagination
                nextPageToken = data.nextPageToken;
                hasMore = !!nextPageToken;
            }

            syncedByProject[projectKey] = projectCount;
        }

        // Update last sync timestamp
        await prisma.globalConfig.upsert({
            where: { key: 'jira_last_sync' },
            update: { value: new Date().toISOString() },
            create: { key: 'jira_last_sync', value: new Date().toISOString(), label: 'Last Sync' },
        });

        const projectSummary = Object.entries(syncedByProject)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');

        return NextResponse.json({
            message: `Synced ${totalSynced} ticket${totalSynced !== 1 ? 's' : ''} across ${projectKeys.length} project(s)${totalSkipped > 0 ? ` (${totalSkipped} skipped — no matching developer)` : ''}${totalErrors > 0 ? ` (${totalErrors} errors)` : ''}`,
            synced: totalSynced,
            skipped: totalSkipped,
            errors: totalErrors,
            byProject: syncedByProject,
            projectSummary,
            // Fix #19 — return the distinct unmatched accountIds so admins know what to map
            unmatchedAccountIds: unmatchedAccountIds.size > 0
                ? Array.from(unmatchedAccountIds)
                : undefined,
        });
    } catch (err) {
        console.error('Jira sync error:', err);
        return NextResponse.json({ error: 'Jira sync failed. Check server logs for details.' }, { status: 500 });
    }
}
