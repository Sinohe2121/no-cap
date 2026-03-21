import { NextResponse, NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Config keys stored in GlobalConfig
const JIRA_KEYS = [
    'jira_host',
    'jira_user_email',
    'jira_api_token',
    'jira_project_keys',
    'jira_sync_days',
    'jira_last_sync',
    'jira_custom_fields',
];

const SAFE_LABEL: Record<string, string> = {
    jira_host:          'Jira Host URL',
    jira_user_email:    'Jira Account Email',
    jira_api_token:     'Jira API Token',
    jira_project_keys:  'Jira Project Keys',
    jira_sync_days:     'Sync Window (days)',
    jira_last_sync:     'Last Sync',
    jira_custom_fields: 'Import Columns',
};

// GET — return current config (API token masked)
export async function GET() {
    try {
        const rows = await prisma.globalConfig.findMany({
            where: { key: { in: JIRA_KEYS } },
        });

        const config: Record<string, string> = {};
        for (const row of rows) {
            // Mask the API token
            config[row.key] = row.key === 'jira_api_token'
                ? '••••••••'
                : row.value;
        }

        return NextResponse.json({
            config,
            isConfigured: !!(config.jira_host && config.jira_user_email && config.jira_api_token),
        });
    } catch (err) {
        console.error('jira-config GET error:', err);
        return NextResponse.json({ error: 'Failed to load config' }, { status: 500 });
    }
}

// POST — save / update config fields OR test connection (?action=test)
export async function POST(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    // ── Connection test action ──────────────────────────────────────────────
    // Previously this was DELETE — moved to POST ?action=test (semantically correct,
    // no body needed, not a destructive operation, and won't be blocked by firewalls).
    if (searchParams.get('action') === 'test') {
        try {
            const rows = await prisma.globalConfig.findMany({
                where: { key: { in: ['jira_host', 'jira_user_email', 'jira_api_token', 'jira_project_keys'] } },
            });
            const cfg: Record<string, string> = {};
            for (const r of rows) cfg[r.key] = r.value;

            if (!cfg.jira_host || !cfg.jira_user_email || !cfg.jira_api_token) {
                return NextResponse.json({
                    ok: false,
                    message: 'Missing credentials — please save Host, Email, and API Token first.',
                });
            }

            const host = cfg.jira_host.replace(/\/$/, '');
            const auth = Buffer.from(`${cfg.jira_user_email}:${cfg.jira_api_token}`).toString('base64');

            // Test by fetching the list of projects the user has access to
            const res = await fetch(`${host}/rest/api/3/project/search?maxResults=50`, {
                headers: {
                    Authorization: `Basic ${auth}`,
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(15_000),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return NextResponse.json({
                    ok: false,
                    message: `Jira returned ${res.status}: ${(err as { message?: string }).message || res.statusText}`,
                });
            }

            const data = await res.json() as { values: { key: string; name: string }[]; total: number };
            const projectKeys = cfg.jira_project_keys
                ? cfg.jira_project_keys.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean)
                : [];

            const foundProjects = (data.values || []).filter((p) =>
                projectKeys.length === 0 || projectKeys.includes(p.key)
            );

            const projectList = foundProjects.slice(0, 5).map((p) => `${p.key} — ${p.name}`).join(', ');

            return NextResponse.json({
                ok: true,
                message: projectKeys.length > 0
                    ? `Connected! Found ${foundProjects.length}/${projectKeys.length} configured project(s): ${projectList}`
                    : `Connected! ${data.total} projects accessible.`,
                projectsFound: foundProjects.length,
            });
        } catch (err) {
            console.error('jira connection test error:', err);
            return NextResponse.json({
                ok: false,
                message: 'Connection failed. Check server logs for details.',
            });
        }
    }

    // ── Fetch Fields action ─────────────────────────────────────────────────
    if (searchParams.get('action') === 'fields') {
        try {
            const rows = await prisma.globalConfig.findMany({
                where: { key: { in: ['jira_host', 'jira_user_email', 'jira_api_token'] } },
            });
            const cfg: Record<string, string> = {};
            for (const r of rows) cfg[r.key] = r.value;

            if (!cfg.jira_host || !cfg.jira_user_email || !cfg.jira_api_token) {
                return NextResponse.json({
                    ok: false,
                    message: 'Missing credentials — please save Host, Email, and API Token first.',
                });
            }

            const host = cfg.jira_host.replace(/\/$/, '');
            const auth = Buffer.from(`${cfg.jira_user_email}:${cfg.jira_api_token}`).toString('base64');

            const res = await fetch(`${host}/rest/api/3/field`, {
                headers: {
                    Authorization: `Basic ${auth}`,
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(15_000),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return NextResponse.json({
                    ok: false,
                    message: `Jira returned ${res.status}: ${(err as { message?: string }).message || res.statusText}`,
                });
            }

            const data = await res.json() as { id: string; name: string; custom?: boolean }[];
            
            return NextResponse.json({
                ok: true,
                fields: data.map(f => ({ id: f.id, name: f.name })),
            });
        } catch (err) {
            console.error('jira fields fetch error:', err);
            return NextResponse.json({
                ok: false,
                message: 'Failed to fetch fields. Check server logs for details.',
            });
        }
    }

    // ── Save config ─────────────────────────────────────────────────────────
    try {
        const body = await request.json();
        const updates: { key: string; value: string }[] = [];

        for (const key of JIRA_KEYS) {
            if (body[key] !== undefined && body[key] !== '' && body[key] !== '••••••••') {
                updates.push({ key, value: String(body[key]).trim() });
            }
        }

        if (updates.length === 0) {
            return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
        }

        for (const { key, value } of updates) {
            await prisma.globalConfig.upsert({
                where: { key },
                update: { value },
                create: { key, value, label: SAFE_LABEL[key] || key },
            });
        }

        return NextResponse.json({ ok: true, saved: updates.map((u) => u.key) });
    } catch (err) {
        console.error('jira-config POST error:', err);
        return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
}
