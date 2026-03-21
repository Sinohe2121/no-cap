import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { normalizeIssueType } from '@/lib/jiraUtils';
import { computeLoadedCost } from '@/lib/costUtils';

export async function POST(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const { startDate, endDate, rosterOnly, year, month } = await request.json();

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'Start Date and End Date are required' }, { status: 400 });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (end < start) {
            return NextResponse.json({ error: 'End Date must be after Start Date' }, { status: 400 });
        }

        // Load Jira config
        const rows = await prisma.globalConfig.findMany({
            where: { key: { in: ['jira_host', 'jira_user_email', 'jira_api_token', 'jira_custom_fields'] } },
        });
        const cfg: Record<string, string> = {};
        for (const r of rows) cfg[r.key] = r.value;

        if (!cfg.jira_host || !cfg.jira_user_email || !cfg.jira_api_token) {
            return NextResponse.json({ error: 'Jira is not configured. Please set credentials in the Integrations page.' }, { status: 400 });
        }

        const host = cfg.jira_host.replace(/\/$/, '');
        const jiraAuth = Buffer.from(`${cfg.jira_user_email}:${cfg.jira_api_token}`).toString('base64');
        const jiraHeaders = { Authorization: `Basic ${jiraAuth}`, Accept: 'application/json' };

        // ── Build developer lookup by EMAIL ────────────────────────────────────
        // This is the reliable matching key — Jira returns emailAddress on each assignee
        const developers = await prisma.developer.findMany({
            select: { id: true, email: true, name: true, jiraUserId: true },
        });
        const devByEmail = new Map(developers.map(d => [d.email.toLowerCase(), d]));

        const projects = await prisma.project.findMany({ select: { id: true, epicKey: true, name: true } });
        const projMap = new Map(projects.map(p => [p.epicKey.toUpperCase(), p]));

        // ── Build roster developer emails (loaded salary > $1) ─────────────────
        let rosterEmails: Set<string> | null = null;
        if (rosterOnly && year && month) {
            const periodStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00`);
            const lastDay = new Date(year, month, 0).getDate();
            const periodEnd = new Date(`${year}-${String(month).padStart(2, '0')}-${lastDay}T23:59:59`);

            const payrollImports = await prisma.payrollImport.findMany({
                where: { payDate: { gte: periodStart, lte: periodEnd } },
                include: {
                    entries: {
                        include: { developer: { select: { email: true } } },
                    },
                },
            });

            rosterEmails = new Set<string>();
            for (const pi of payrollImports) {
                for (const entry of pi.entries) {
                    const salary = entry.grossSalary || 0;
                    const fringe = salary * (pi.fringeBenefitRate ?? 0);
                    const sbc = entry.sbcAmount || 0;
                    const loadedCost = computeLoadedCost(salary, pi.fringeBenefitRate ?? 0, sbc);
                    if (loadedCost > 1 && entry.developer.email) {
                        rosterEmails.add(entry.developer.email.toLowerCase());
                    }
                }
            }

            console.log(`[Jira Preview] Roster for ${year}-${month}: ${rosterEmails.size} developers qualify (loaded > $1)`);
        }

        // ── JQL: bounded queries ───────────────────────────────────────────────
        const formatForJql = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '/');
        const startJql = formatForJql(start);
        const endAux = new Date(end);
        endAux.setDate(endAux.getDate() + 1);
        const endJql = formatForJql(endAux);

        // Two queries: resolved-in-period + open-created-in-period
        const jqlResolved = `resolved >= "${startJql}" AND resolved < "${endJql}" ORDER BY created DESC`;
        const jqlOpen = `resolution is EMPTY AND created >= "${startJql}" AND created < "${endJql}" ORDER BY created DESC`;
        const jqlQueries = [jqlResolved, jqlOpen];

        // ── Parse custom fields config ─────────────────────────────────────────
        let extraFields: { id: string; name: string }[] = [];
        try {
            const parsed = JSON.parse(cfg.jira_custom_fields || '[]');
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
                extraFields = parsed.map((id: string) => ({ id, name: id }));
            } else {
                extraFields = parsed;
            }
        } catch {}

        const baseFields = [
            'summary', 'issuetype', 'assignee', 'project',
            'customfield_10014', 'customfield_10016', 'customfield_10028',
            'resolutiondate', 'fixVersions', 'parent',
        ];
        const fields = Array.from(new Set([...baseFields, ...extraFields.map(f => f.id)]));

        // ── Fetch tickets from Jira ────────────────────────────────────────────
        const allIssues: any[] = [];
        const seenKeys = new Set<string>();

        for (const jqlString of jqlQueries) {
            let nextPageToken: string | undefined = undefined;
            let hasMore = true;

            while (hasMore) {
                const url = `${host}/rest/api/3/search/jql`;
                const bodyPayload: any = {
                    jql: jqlString,
                    maxResults: 100,
                    fields,
                };
                if (nextPageToken) {
                    bodyPayload.nextPageToken = nextPageToken;
                }

                const res = await fetch(url, {
                    method: 'POST',
                    headers: { ...jiraHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyPayload),
                });

                if (!res.ok) {
                    const errBody = await res.text();
                    console.error(`Jira search failed:`, res.status, errBody);
                    return NextResponse.json({ error: 'Jira search request failed. Check server logs for details.' }, { status: 500 });
                }

                const data = await res.json();
                const pageIssues = data.issues || [];
                for (const issue of pageIssues) {
                    if (!seenKeys.has(issue.key)) {
                        seenKeys.add(issue.key);
                        allIssues.push(issue);
                    }
                }

                nextPageToken = data.nextPageToken;
                hasMore = !!nextPageToken;
            }
        }

        console.log(`[Jira Preview] Fetched ${allIssues.length} total issues from Jira`);

        // ── Process and filter tickets ──────────────────────────────────────────
        const previewTickets = [];

        const extractStoryPoints = (f: any): number => {
            return f.customfield_10016 ?? f.customfield_10014 ?? f.customfield_10028 ?? 0;
        };


        for (const issue of allIssues) {
            const issueKey = issue.key;
            const assignee = issue.fields.assignee;
            const assigneeEmail = assignee?.emailAddress?.toLowerCase();

            // Match developer by EMAIL from Jira response
            const dev = assigneeEmail ? devByEmail.get(assigneeEmail) : null;

            // ROSTER FILTER: when enabled, skip tickets not assigned to rostered developers
            if (rosterOnly && rosterEmails) {
                if (!assigneeEmail || !rosterEmails.has(assigneeEmail)) {
                    continue; // Skip entirely — not on the roster
                }
            }

            const issueProjectKey = issueKey.split('-')[0];
            const proj = projMap.get(issueProjectKey);
            const jiraProjectName = issue.fields.project?.name || issueProjectKey;

            let importable = true;
            const reasons: string[] = [];

            if (!dev) {
                importable = false;
                reasons.push('Assignee is not mapped to an active Developer');
            }
            if (!proj) {
                // Not a blocker — just informational. Tickets can still be imported.
                reasons.push('No local project mapping (using Jira project name)');
            }

            // Build custom field values
            const customFieldsObj: Record<string, string> = {};
            for (const f of extraFields) {
                let val = issue.fields[f.id];
                if (f.id === 'issuekey') val = issue.key;

                if (val != null) {
                    if (typeof val === 'object') {
                        if (Array.isArray(val)) {
                            customFieldsObj[f.name] = val
                                .map((v: any) => typeof v === 'object' ? (v.displayName || v.name || v.value || JSON.stringify(v)) : String(v))
                                .join(', ');
                        } else {
                            customFieldsObj[f.name] = val.displayName || val.name || val.value || JSON.stringify(val);
                        }
                    } else {
                        customFieldsObj[f.name] = String(val);
                    }
                }
            }

            // Fallback: if "Project" column is empty, populate from standard Jira project field
            for (const f of extraFields) {
                if (f.name.toLowerCase() === 'project' && !customFieldsObj[f.name]) {
                    const stdProject = issue.fields.project;
                    if (stdProject) {
                        customFieldsObj[f.name] = stdProject.name || stdProject.key || '';
                    }
                }
            }

            previewTickets.push({
                ticketId: issueKey,
                epicKey: issueProjectKey,
                projectId: proj?.id || null,
                projectName: proj?.name || jiraProjectName,
                issueType: normalizeIssueType(issue.fields.issuetype.name),
                summary: issue.fields.summary,
                storyPoints: extractStoryPoints(issue.fields),
                resolutionDate: issue.fields.resolutiondate,
                assigneeId: dev?.id || null,
                assigneeName: dev?.name || assignee?.displayName || 'Unassigned',
                customFields: customFieldsObj,
                importable,
                unimportableReasons: reasons,
            });
        }

        console.log(`[Jira Preview] After filtering: ${previewTickets.length} tickets returned (rosterOnly=${rosterOnly})`);

        return NextResponse.json({ tickets: previewTickets, customFieldsConfig: extraFields });

    } catch (error) {
        console.error('Jira preview error:', error);
        return NextResponse.json({ error: 'Failed to query Jira preview' }, { status: 500 });
    }
}
