/**
 * Deeper investigation for a specific ticket that "should" have been
 * imported in a given period but wasn't:
 *   1. Run the EXACT period JQL against Jira, scoped to this ticket
 *      (proves whether Jira would have returned it).
 *   2. Count this assignee's tickets that DID land in that period
 *      (proves the roster wasn't the cause if other tickets passed).
 *   3. Show how many Initiative-typed tickets (or other unusual issue
 *      types) made it into that period — to detect type-related bugs.
 *
 * Usage: npx tsx scripts/diagnose-deeper.ts EIP-2078 2 2026
 */
import prisma from '../src/lib/prisma';
import { formatPeriodLabel } from '../src/lib/periodLabel';

async function main() {
    const [, , ticketKey, monthStr, yearStr] = process.argv;
    const month = Number(monthStr);
    const year = Number(yearStr);
    const periodLabel = formatPeriodLabel(month, year);

    const cfgRows = await prisma.globalConfig.findMany({
        where: { key: { in: ['jira_host', 'jira_user_email', 'jira_api_token'] } },
    });
    const cfg: Record<string, string> = {};
    for (const r of cfgRows) cfg[r.key] = r.value;
    const host = cfg.jira_host.replace(/\/$/, '');
    const auth = Buffer.from(`${cfg.jira_user_email}:${cfg.jira_api_token}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/json' };

    // ── 1. Run the exact period JQL, scoped to this key ──────────────────
    const periodStart = new Date(year, month - 1, 1);
    const periodEndExclusive = new Date(year, month, 1);
    const fmt = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '/');
    const jql = `key = ${ticketKey} AND created < "${fmt(periodEndExclusive)}" AND (resolution is EMPTY OR resolved >= "${fmt(periodStart)}")`;
    console.log(`\nGate 1 — replay exact period JQL against Jira:`);
    console.log(`  JQL: ${jql}`);
    const res = await fetch(`${host}/rest/api/3/search/jql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jql, maxResults: 5, fields: ['summary', 'created'] }),
    });
    const data: any = await res.json();
    console.log(`  Jira returned ${(data.issues || []).length} issue(s)`);
    if ((data.issues || []).length === 0) {
        console.log(`  ✗ Jira did NOT return ${ticketKey} for the period JQL — the import never saw it.`);
    } else {
        console.log(`  ✓ Jira would return ${ticketKey} for this period's JQL`);
    }

    // ── 2. Did this ticket's assignee have OTHER tickets in this period? ─
    const issueRes = await fetch(`${host}/rest/api/3/issue/${ticketKey}?fields=assignee`, { headers });
    const issue: any = await issueRes.json();
    const assigneeEmail = issue.fields?.assignee?.emailAddress?.toLowerCase();
    if (assigneeEmail) {
        const dev = await prisma.developer.findFirst({
            where: { email: { equals: assigneeEmail, mode: 'insensitive' } },
            select: { id: true, name: true },
        });
        if (dev) {
            const otherTickets = await prisma.jiraTicket.count({
                where: { assigneeId: dev.id, importPeriod: periodLabel },
            });
            console.log(`\nGate 2 — ${dev.name}'s tickets imported into ${periodLabel}: ${otherTickets}`);
            if (otherTickets > 0) {
                console.log(`  → Other tickets for this assignee DID land. Roster filter cannot be the cause for ${ticketKey}.`);
            } else {
                console.log(`  → No other tickets for this assignee in the period. Could indicate roster filter or scope issue.`);
            }
            const samples = await prisma.jiraTicket.findMany({
                where: { assigneeId: dev.id, importPeriod: periodLabel },
                select: { ticketId: true, issueType: true, summary: true },
                take: 10,
            });
            for (const s of samples) console.log(`    - ${s.ticketId} [${s.issueType}] ${s.summary.slice(0, 60)}`);
        }
    }

    // ── 3. Were any Initiative-type tickets imported in this period? ─────
    // Initiative isn't in normalizeIssueType's known list, so it ends up as
    // 'TASK' in the DB. To find them, we look at the customFields.Issue Type
    // (raw Jira value) on imported rows.
    const allInPeriod = await prisma.jiraTicket.findMany({
        where: { importPeriod: periodLabel },
        select: { ticketId: true, customFields: true, issueType: true },
    });
    const initiativeRows = allInPeriod.filter(r => {
        const cf = r.customFields as Record<string, string> | null;
        const raw = (cf?.['Issue Type'] || cf?.['issuetype'] || '').toString().toLowerCase();
        return raw === 'initiative';
    });
    console.log(`\nGate 3 — Tickets with raw Jira issueType="Initiative" imported into ${periodLabel}: ${initiativeRows.length}`);
    for (const r of initiativeRows.slice(0, 5)) console.log(`  - ${r.ticketId}`);
    if (initiativeRows.length === 0) {
        console.log(`  → No Initiatives have ever been imported. Could indicate the user has been deselecting them by issue-type filter.`);
    }

    // ── 4. Look up the bigger picture: any imported ticket created on the
    // same day or after EIP-2078, to confirm the import "saw" that part of
    // the timeline. ──────────────────────────────────────────────────────
    const createdISO = (await (await fetch(`${host}/rest/api/3/issue/${ticketKey}?fields=created`, { headers })).json()).fields.created;
    console.log(`\nReference: ${ticketKey} was created ${createdISO}.`);
    const sameDayJql = `created >= "${createdISO.slice(0, 10).replace(/-/g, '/')}" AND created < "${fmt(periodEndExclusive)}" AND (resolution is EMPTY OR resolved >= "${fmt(periodStart)}")`;
    const sameDayRes = await fetch(`${host}/rest/api/3/search/jql`, {
        method: 'POST', headers,
        body: JSON.stringify({ jql: sameDayJql, maxResults: 0, fields: ['summary'] }),
    });
    const sameDayData: any = await sameDayRes.json();
    console.log(`  Jira tickets matching the period JQL with created >= ${createdISO.slice(0, 10)}: ${sameDayData.total ?? '(unknown)'}`);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
