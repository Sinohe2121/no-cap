export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/integrations/jira/ticket/[key]
 *
 * Fetches a single Jira issue's details using the stored Jira credentials.
 * Used by the JiraTicketSlideOver component on the tickets page for audit proof.
 */
export async function GET(
    request: Request,
    { params }: { params: { key: string } }
) {
    try {
        const auth = await requireAuth(request);
        if (auth instanceof NextResponse) return auth;

        const issueKey = params.key.toUpperCase();
        if (!issueKey || !/^[A-Z]+-\d+$/.test(issueKey)) {
            return NextResponse.json({ error: 'Invalid ticket key format' }, { status: 400 });
        }

        // Load Jira credentials from GlobalConfig
        const rows = await prisma.globalConfig.findMany({
            where: { key: { in: ['jira_host', 'jira_user_email', 'jira_api_token'] } },
        });
        const cfg: Record<string, string> = {};
        for (const r of rows) cfg[r.key] = r.value;

        if (!cfg.jira_host || !cfg.jira_user_email || !cfg.jira_api_token) {
            return NextResponse.json(
                { error: 'Jira is not configured. Please add credentials in the Integrations page.' },
                { status: 400 }
            );
        }

        const host = cfg.jira_host.replace(/\/$/, '');
        const jiraAuth = Buffer.from(`${cfg.jira_user_email}:${cfg.jira_api_token}`).toString('base64');

        const fields = [
            'summary',
            'status',
            'assignee',
            'issuetype',
            'priority',
            'description',
            'customfield_10016', // story points (next-gen)
            'customfield_10028', // story points (classic)
            'resolutiondate',
            'fixVersions',
            'parent',
            'labels',
            'created',
            'updated',
        ].join(',');

        const url = `${host}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`;

        const res = await fetch(url, {
            headers: {
                Authorization: `Basic ${jiraAuth}`,
                Accept: 'application/json',
            },
            // Don't cache so auditors always see live data
            cache: 'no-store',
        });

        if (res.status === 404) {
            return NextResponse.json({ error: `Ticket ${issueKey} not found in Jira.` }, { status: 404 });
        }

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[Jira ticket fetch] ${res.status}:`, errText);
            return NextResponse.json({ error: 'Failed to fetch ticket from Jira.' }, { status: 502 });
        }

        const issue = await res.json();
        const f = issue.fields;

        // Extract story points from common custom field locations
        const storyPoints = f.customfield_10016 ?? f.customfield_10028 ?? null;

        // Convert Atlassian Document Format description to plain text
        const description = extractPlainText(f.description);

        return NextResponse.json({
            ticketId: issue.key,
            summary: f.summary,
            status: f.status?.name ?? null,
            statusCategory: f.status?.statusCategory?.colorName ?? null,
            assigneeName: f.assignee?.displayName ?? null,
            assigneeEmail: f.assignee?.emailAddress ?? null,
            issueType: f.issuetype?.name ?? null,
            priority: f.priority?.name ?? null,
            storyPoints,
            resolutionDate: f.resolutiondate ?? null,
            fixVersions: (f.fixVersions ?? []).map((v: { name: string }) => v.name),
            labels: f.labels ?? [],
            description,
            parentKey: f.parent?.key ?? null,
            parentSummary: f.parent?.fields?.summary ?? null,
            created: f.created ?? null,
            updated: f.updated ?? null,
            jiraUrl: `${host}/browse/${issue.key}`,
        });

    } catch (err) {
        console.error('[Jira ticket fetch] Unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * Recursively extracts plain text from an Atlassian Document Format (ADF) node.
 * Returns a trimmed string or null if no content.
 */
function extractPlainText(node: any): string | null {
    if (!node) return null;
    if (typeof node === 'string') return node;

    const parts: string[] = [];

    if (node.type === 'text' && node.text) {
        parts.push(node.text);
    }

    if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
            const childText = extractPlainText(child);
            if (childText) parts.push(childText);
        }
    }

    const result = parts.join(' ').replace(/\s+/g, ' ').trim();
    return result || null;
}
