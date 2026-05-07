/**
 * Diagnose why a Jira ticket wasn't imported in a given period.
 *
 * Usage:
 *   npx tsx scripts/diagnose-ticket.ts EIP-2078 2 2026
 *
 * Walks each gate in the same order the import does:
 *   1. Jira's JQL window (created < endOfPeriod AND (open OR resolved>=startOfPeriod))
 *   2. roster filter — assignee on the period's payroll roster with loaded cost > $1
 *   3. Developer match — assignee email maps to a Developer record
 *   4. Already in DB? — and if so, with what importPeriod
 *
 * Prints a per-gate verdict so you can see which one(s) the ticket
 * would have failed during the period in question.
 */
import prisma from '../src/lib/prisma';
import { computeLoadedCost } from '../src/lib/costUtils';
import { formatPeriodLabel } from '../src/lib/periodLabel';

async function main() {
    const [, , ticketKey, monthStr, yearStr] = process.argv;
    if (!ticketKey || !monthStr || !yearStr) {
        console.error('Usage: npx tsx scripts/diagnose-ticket.ts <KEY> <month 1-12> <year>');
        process.exit(1);
    }
    const month = Number(monthStr);
    const year = Number(yearStr);
    const periodLabel = formatPeriodLabel(month, year);

    console.log(`\n=== Diagnosing ${ticketKey} for period ${periodLabel} ===\n`);

    // ── Load Jira creds from GlobalConfig (same as preview/route.ts) ──────
    const cfgRows = await prisma.globalConfig.findMany({
        where: { key: { in: ['jira_host', 'jira_user_email', 'jira_api_token'] } },
    });
    const cfg: Record<string, string> = {};
    for (const r of cfgRows) cfg[r.key] = r.value;
    if (!cfg.jira_host || !cfg.jira_user_email || !cfg.jira_api_token) {
        throw new Error('Jira credentials missing from GlobalConfig.');
    }
    const host = cfg.jira_host.replace(/\/$/, '');
    const auth = Buffer.from(`${cfg.jira_user_email}:${cfg.jira_api_token}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };

    // ── 1. Pull the ticket directly from Jira ─────────────────────────────
    const issueRes = await fetch(`${host}/rest/api/3/issue/${ticketKey}?fields=summary,assignee,created,resolutiondate,resolution,status,issuetype`, { headers });
    if (!issueRes.ok) {
        console.log(`✗ Jira returned ${issueRes.status} for ${ticketKey}. Body: ${await issueRes.text()}`);
        process.exit(1);
    }
    const issue: any = await issueRes.json();
    const f = issue.fields;
    const assignee = f.assignee;
    const assigneeEmail = assignee?.emailAddress?.toLowerCase() ?? null;
    const createdDate = f.created ? new Date(f.created) : null;
    const resolutionDate = f.resolutiondate ? new Date(f.resolutiondate) : null;

    console.log(`Jira metadata for ${ticketKey}:`);
    console.log(`  summary:        ${f.summary}`);
    console.log(`  status:         ${f.status?.name}`);
    console.log(`  issueType:      ${f.issuetype?.name}`);
    console.log(`  assignee:       ${assignee?.displayName ?? '(unassigned)'} <${assigneeEmail ?? '—'}>`);
    console.log(`  created:        ${createdDate?.toISOString() ?? '—'}`);
    console.log(`  resolutionDate: ${resolutionDate?.toISOString() ?? '(unresolved)'}`);
    console.log('');

    // ── 2. Would Jira's JQL for the target period have returned it? ──────
    const periodStart = new Date(year, month - 1, 1);
    const periodEndExclusive = new Date(year, month, 1); // first day of NEXT month
    const passesJql =
        createdDate && createdDate < periodEndExclusive &&
        (!resolutionDate || resolutionDate >= periodStart);
    console.log(`Gate 1 — Jira JQL window for ${periodLabel}:`);
    console.log(`  created < ${periodEndExclusive.toISOString().slice(0, 10)}: ${createdDate && createdDate < periodEndExclusive ? '✓' : '✗'}`);
    console.log(`  unresolved OR resolved ≥ ${periodStart.toISOString().slice(0, 10)}: ${!resolutionDate || resolutionDate >= periodStart ? '✓' : '✗'}`);
    console.log(`  → ${passesJql ? '✓ PASS — Jira would have returned it' : '✗ FAIL — Jira would NOT return it for this period'}`);
    console.log('');

    // ── 3. Developer match by email ──────────────────────────────────────
    const dev = assigneeEmail
        ? await prisma.developer.findFirst({
            where: { email: { equals: assigneeEmail, mode: 'insensitive' } },
            select: { id: true, name: true, email: true, isActive: true },
        })
        : null;
    console.log(`Gate 2 — Developer match by assignee email:`);
    if (!assigneeEmail) {
        console.log(`  ✗ FAIL — Jira ticket has no assignee email. Would be flagged not-importable.`);
    } else if (!dev) {
        console.log(`  ✗ FAIL — No Developer row found for ${assigneeEmail}. Ticket would be marked importable=false and DESELECTED by default in the preview.`);
    } else {
        console.log(`  ✓ PASS — Developer ${dev.name} (id=${dev.id}, active=${dev.isActive})`);
    }
    console.log('');

    // ── 4. Roster filter for the period (loaded cost > $1) ───────────────
    const periodStartTs = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00`);
    const lastDay = new Date(year, month, 0).getDate();
    const periodEndTs = new Date(`${year}-${String(month).padStart(2, '0')}-${lastDay}T23:59:59`);
    const payrollImports = await prisma.payrollImport.findMany({
        where: { payDate: { gte: periodStartTs, lte: periodEndTs } },
        include: { entries: { include: { developer: { select: { email: true, name: true } } } } },
    });
    const rosterEmails = new Set<string>();
    let assigneeOnRoster = false;
    let assigneeRosterReason = '';
    for (const pi of payrollImports) {
        for (const entry of pi.entries) {
            const salary = entry.grossSalary || 0;
            const sbc = entry.sbcAmount || 0;
            const loaded = computeLoadedCost(salary, pi.fringeBenefitRate ?? 0, sbc);
            const email = entry.developer.email?.toLowerCase();
            if (loaded > 1 && email) rosterEmails.add(email);
            if (assigneeEmail && email === assigneeEmail) {
                assigneeOnRoster = loaded > 1;
                assigneeRosterReason = `loaded cost = $${loaded.toFixed(2)} (salary=${salary}, sbc=${sbc}, fringe=${pi.fringeBenefitRate})`;
            }
        }
    }
    console.log(`Gate 3 — Roster filter for ${periodLabel} (only checked when "rosterOnly" toggle was ON during import):`);
    console.log(`  payroll periods found: ${payrollImports.length}, qualifying developers: ${rosterEmails.size}`);
    if (!assigneeEmail) {
        console.log(`  ✗ FAIL — no assignee email to look up.`);
    } else if (assigneeRosterReason) {
        console.log(`  assignee record: ${assigneeRosterReason}`);
        console.log(`  → ${assigneeOnRoster ? '✓ on roster' : '✗ NOT on roster (loaded cost ≤ $1)'}`);
    } else {
        console.log(`  ✗ FAIL — assignee ${assigneeEmail} has NO payroll entry for ${periodLabel}. Would be skipped if rosterOnly was on.`);
    }
    console.log('');

    // ── 5. Is the ticket actually in our DB right now? ───────────────────
    const dbRow = await prisma.jiraTicket.findUnique({
        where: { ticketId: ticketKey },
        select: { ticketId: true, importPeriod: true, resolutionDate: true, summary: true, assigneeId: true, projectId: true, createdAt: true },
    });
    console.log(`Gate 4 — Current DB state:`);
    if (!dbRow) {
        console.log(`  ✗ Not in JiraTicket table at all.`);
    } else {
        console.log(`  ✓ Present. importPeriod=${dbRow.importPeriod ?? 'null'}, dbCreatedAt=${dbRow.createdAt.toISOString()}, resolutionDate=${dbRow.resolutionDate?.toISOString() ?? 'open'}`);
    }
    console.log('');

    // ── Summary ──────────────────────────────────────────────────────────
    console.log(`=== Verdict ===`);
    if (dbRow) {
        console.log(`Ticket IS in DB. importPeriod = ${dbRow.importPeriod}. Not actually missing.`);
    } else if (!passesJql) {
        console.log(`Jira's JQL for ${periodLabel} would NOT return this ticket — it's outside the active-during-period window.`);
    } else {
        const reasons: string[] = [];
        if (!dev) reasons.push(`no Developer match for ${assigneeEmail ?? '(no assignee)'} → importable=false → deselected by default in preview`);
        if (!assigneeOnRoster) reasons.push(`assignee not on ${periodLabel} roster (rosterOnly toggle would have skipped it)`);
        if (reasons.length === 0) {
            console.log(`No automated gate would have excluded this ticket. Most likely cause: user manually unchecked it before clicking Import.`);
        } else {
            console.log(`Most likely exclusion reason(s):`);
            for (const r of reasons) console.log(`  • ${r}`);
        }
    }
    console.log('');
}

main()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
