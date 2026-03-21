import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * POST /api/integrations/jira/sync-users
 * 
 * Looks up each developer's email in Jira Cloud to find and store
 * their real Jira accountId. This enables JQL assignee filtering.
 */
export async function POST(req: Request) {
    try {
        const rbac = await requireAdmin(req);
        if (rbac instanceof NextResponse) return rbac;

        // Load Jira config
        const rows = await prisma.globalConfig.findMany({
            where: { key: { in: ['jira_host', 'jira_user_email', 'jira_api_token'] } },
        });
        const cfg: Record<string, string> = {};
        for (const r of rows) cfg[r.key] = r.value;

        if (!cfg.jira_host || !cfg.jira_user_email || !cfg.jira_api_token) {
            return NextResponse.json({ error: 'Jira is not configured.' }, { status: 400 });
        }

        const host = cfg.jira_host.replace(/\/$/, '');
        const auth = Buffer.from(`${cfg.jira_user_email}:${cfg.jira_api_token}`).toString('base64');
        const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };

        // Get all developers
        const developers = await prisma.developer.findMany({
            select: { id: true, name: true, email: true, jiraUserId: true },
        });

        const results: { name: string; email: string; status: string; accountId?: string }[] = [];

        for (const dev of developers) {
            // Try finding by email first, then by display name
            let accountId: string | null = null;

            // Method 1: Search by email
            if (dev.email) {
                try {
                    const res = await fetch(
                        `${host}/rest/api/3/user/search?query=${encodeURIComponent(dev.email)}&maxResults=5`,
                        { headers }
                    );
                    if (res.ok) {
                        const users = await res.json();
                        if (users.length === 1) {
                            accountId = users[0].accountId;
                        } else if (users.length > 1) {
                            // Try exact email match
                            const exact = users.find((u: any) =>
                                u.emailAddress?.toLowerCase() === dev.email.toLowerCase()
                            );
                            if (exact) accountId = exact.accountId;
                        }
                    }
                } catch {}
            }

            // Method 2: If email didn't match, try by display name
            if (!accountId && dev.name) {
                try {
                    // Extract the first and last name from "Last, First" format
                    const nameParts = dev.name.split(',').map(s => s.trim());
                    const searchName = nameParts.length >= 2 
                        ? `${nameParts[1]} ${nameParts[0]}` // "First Last"
                        : dev.name;

                    const res = await fetch(
                        `${host}/rest/api/3/user/search?query=${encodeURIComponent(searchName)}&maxResults=5`,
                        { headers }
                    );
                    if (res.ok) {
                        const users = await res.json();
                        if (users.length === 1) {
                            accountId = users[0].accountId;
                        }
                    }
                } catch {}
            }

            if (accountId) {
                await prisma.developer.update({
                    where: { id: dev.id },
                    data: { jiraUserId: accountId },
                });
                results.push({ name: dev.name, email: dev.email, status: 'matched', accountId });
            } else {
                results.push({ name: dev.name, email: dev.email, status: 'not_found' });
            }
        }

        const matched = results.filter(r => r.status === 'matched').length;
        const unmatched = results.filter(r => r.status === 'not_found').length;

        return NextResponse.json({
            matched,
            unmatched,
            total: results.length,
            results,
        });
    } catch (error) {
        console.error('Jira user sync error:', error);
        return NextResponse.json({ error: 'Failed to sync Jira users' }, { status: 500 });
    }
}
