export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { normalizeIssueType } from '@/lib/jiraUtils';
import { computeLoadedCost } from '@/lib/costUtils';
import { formatPeriodLabel } from '@/lib/periodLabel';
import { activeInPeriodWhere, parsePeriodLabel } from '@/lib/periodTickets';

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

        // The period import is the universe of tickets developers worked on
        // during the period — every ticket whose state at end-of-period was
        // either "resolved during the period" or "still open." Tickets
        // resolved before the period began are excluded; they belong to the
        // earlier period in which they were resolved.
        //
        // One combined clause covers both branches:
        //   • created < endJql                    → ticket existed during the period
        //   • resolution is EMPTY                 → still open (now)
        //   • resolved >= startJql                → resolved on/after period start
        //                                          (covers resolved-during-period
        //                                          AND resolved-after-period-end —
        //                                          the latter was still open AS OF
        //                                          end of period at import time)
        const jqlActiveDuringPeriod =
            `created < "${endJql}" AND (resolution is EMPTY OR resolved >= "${startJql}") ORDER BY created DESC`;
        const jqlQueries = [jqlActiveDuringPeriod];

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
            'resolutiondate', 'created', 'fixVersions', 'parent',
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

        // ── Existing-ticket lookup for new vs carry-forward classification ────
        // A ticket is "carry-forward" if our DB already has a record for it
        // (importPeriod is set, from a prior import). The DB record is the
        // authoritative source for that ticket's first-seen period.
        const jiraKeysFromQuery = allIssues.map((i: any) => i.key);
        const existingTicketRows = jiraKeysFromQuery.length > 0
            ? await prisma.jiraTicket.findMany({
                where: { ticketId: { in: jiraKeysFromQuery } },
                select: { ticketId: true, importPeriod: true, resolutionDate: true },
            })
            : [];
        const existingTicketByKey = new Map<string, { importPeriod: string | null; resolutionDate: Date | null }>(
            existingTicketRows.map(t => [t.ticketId, { importPeriod: t.importPeriod, resolutionDate: t.resolutionDate }]),
        );

        // ── Has any prior period actually been imported? ────────────────────
        // The "carry-forward" and "unexpected carry-forward" buckets only make
        // sense if there's a chronologically EARLIER period in the system. On
        // a seed import (the very first period anyone has ever imported), all
        // pre-period-creation tickets are just normal "new" — there's no
        // earlier import that should have caught them.
        const periodLabel = (year && month) ? formatPeriodLabel(month, year) : null;
        const previousLabel = (year && month)
            ? (month === 1 ? formatPeriodLabel(12, year - 1) : formatPeriodLabel(month - 1, year))
            : null;
        const currentKey = (year && month) ? year * 12 + (month - 1) : null;
        const labelKey = (label: string | null): number | null => {
            if (!label) return null;
            const p = parsePeriodLabel(label);
            return p ? p.year * 12 + (p.month - 1) : null;
        };

        // Detect any imported ticket whose importPeriod is strictly before the
        // current period — that's the signal that prior-period history exists.
        let priorPeriodExists = false;
        if (currentKey !== null) {
            const distinctImportPeriods = await prisma.jiraTicket.findMany({
                where: { importPeriod: { not: null } },
                distinct: ['importPeriod'],
                select: { importPeriod: true },
            });
            for (const row of distinctImportPeriods) {
                const k = labelKey(row.importPeriod);
                if (k !== null && k < currentKey) { priorPeriodExists = true; break; }
            }
        }

        // ── Audit-A: tickets we expected to see as carry-forwards but didn't ──
        // The system's last view of these tickets had them active going into
        // this period (importPeriod ≤ {previous period} AND not resolved before
        // start of this period). If Jira's response for this period does NOT
        // include them, something has changed externally — they were closed
        // out-of-band, deleted, or otherwise dropped from the active scope.
        // Only meaningful when prior history exists.
        let missingCarryForwards: {
            ticketId: string;
            importPeriod: string | null;
            resolutionDate: string | null;
            assigneeName: string | null;
            summary: string | null;
        }[] = [];

        if (previousLabel && priorPeriodExists) {
            const expectedCarryRows = await prisma.jiraTicket.findMany({
                where: activeInPeriodWhere(previousLabel),
                select: {
                    ticketId: true,
                    importPeriod: true,
                    resolutionDate: true,
                    summary: true,
                    assignee: { select: { name: true } },
                },
            });
            const jiraKeySet = new Set(jiraKeysFromQuery);
            missingCarryForwards = expectedCarryRows
                .filter(t => !jiraKeySet.has(t.ticketId))
                .map(t => ({
                    ticketId: t.ticketId,
                    importPeriod: t.importPeriod,
                    resolutionDate: t.resolutionDate ? t.resolutionDate.toISOString() : null,
                    assigneeName: t.assignee?.name ?? null,
                    summary: t.summary,
                }));
        }

        // ── Process and bucket tickets from Jira ────────────────────────────────
        // Buckets returned to the UI:
        //   newInPeriod          — not in DB, created during this period (true new work)
        //   carryForwardMatched  — in DB (importPeriod set in a prior period); refresh-only
        //   carryForwardUnexpected — not in DB, created BEFORE this period (audit-B:
        //                            should have been imported earlier; surface so the
        //                            user can decide to add it now)
        const newInPeriod: any[] = [];
        const carryForwardMatched: any[] = [];
        const carryForwardUnexpected: any[] = [];

        // periodStart is used to classify "new vs unexpected" by Jira's createdDate
        const periodStartDate = (year && month) ? new Date(year, month - 1, 1) : null;

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

            const existingDbRow = existingTicketByKey.get(issueKey);
            const issueCreatedRaw = issue.fields.created;
            const issueCreatedDate = issueCreatedRaw ? new Date(issueCreatedRaw) : null;
            // Bucket classification:
            //   carryForwardMatched   — already in DB AND its importPeriod is
            //                           strictly EARLIER than the current period
            //   carryForwardUnexpected — not in DB, was created before this
            //                           period started, AND prior-period
            //                           history exists in the system (i.e.
            //                           something was imported earlier and we
            //                           expected to have seen this ticket then)
            //   new                   — everything else, including:
            //                           • truly new tickets created in-period
            //                           • re-runs of the same period
            //                           • back-fills (existing record's
            //                             importPeriod is at or after the
            //                             period being imported now)
            //                           • seed imports where no earlier
            //                             history exists yet
            const existingKey = labelKey(existingDbRow?.importPeriod ?? null);
            let bucket: 'new' | 'carryForwardMatched' | 'carryForwardUnexpected';
            let originPeriod: string | null = null;
            if (existingDbRow && currentKey !== null && existingKey !== null && existingKey < currentKey) {
                bucket = 'carryForwardMatched';
                originPeriod = existingDbRow.importPeriod;
            } else if (
                !existingDbRow &&
                priorPeriodExists &&
                periodStartDate && issueCreatedDate && issueCreatedDate < periodStartDate
            ) {
                bucket = 'carryForwardUnexpected';
                // Best-effort guess at the period this should have been first imported in
                originPeriod = formatPeriodLabel(issueCreatedDate.getMonth() + 1, issueCreatedDate.getFullYear());
            } else {
                bucket = 'new';
                // For back-fills, surface the existing later-period label so
                // the UI can hint that this row will move backward on import.
                if (existingDbRow && currentKey !== null && existingKey !== null && existingKey >= currentKey) {
                    originPeriod = existingDbRow.importPeriod;
                }
            }

            const previewRow = {
                ticketId: issueKey,
                epicKey: issueProjectKey,
                projectId: proj?.id || null,
                projectName: proj?.name || jiraProjectName,
                issueType: normalizeIssueType(issue.fields.issuetype.name),
                summary: issue.fields.summary,
                storyPoints: extractStoryPoints(issue.fields),
                createdDate: issueCreatedRaw ?? null,
                resolutionDate: issue.fields.resolutiondate,
                assigneeId: dev?.id || null,
                assigneeName: dev?.name || assignee?.displayName || 'Unassigned',
                customFields: customFieldsObj,
                importable,
                unimportableReasons: reasons,
                bucket,
                originPeriod,
            };

            if (bucket === 'new') newInPeriod.push(previewRow);
            else if (bucket === 'carryForwardMatched') carryForwardMatched.push(previewRow);
            else carryForwardUnexpected.push(previewRow);
        }

        // Legacy single-array view for any caller that still consumes `tickets`
        const previewTickets = [...newInPeriod, ...carryForwardMatched, ...carryForwardUnexpected];

        console.log(
            `[Jira Preview] Buckets — new: ${newInPeriod.length}, ` +
            `carry-forward (matched): ${carryForwardMatched.length}, ` +
            `unexpected carry-forward: ${carryForwardUnexpected.length}, ` +
            `missing carry-forward: ${missingCarryForwards.length}, ` +
            `(rosterOnly=${rosterOnly})`,
        );

        return NextResponse.json({
            tickets: previewTickets,
            customFieldsConfig: extraFields,
            buckets: {
                newInPeriod,
                carryForwardMatched,
                carryForwardUnexpected,
                missingCarryForwards,
            },
            periodLabel,
            previousPeriodLabel: previousLabel,
        });

    } catch (error) {
        console.error('Jira preview error:', error);
        return NextResponse.json({ error: 'Failed to query Jira preview' }, { status: 500 });
    }
}
