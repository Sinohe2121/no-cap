/**
 * Inspect when the period import was actually run, and whether any
 * tickets created on/after a given date were captured by it. Useful
 * for ruling out "import was run before the ticket existed" as the
 * cause of a missing carry-forward.
 *
 * Usage: npx tsx scripts/diagnose-import-timing.ts "February 2026"
 */
import prisma from '../src/lib/prisma';

async function main() {
    const periodLabel = process.argv[2];
    if (!periodLabel) {
        console.error('Usage: npx tsx scripts/diagnose-import-timing.ts "<Period Label>"');
        process.exit(1);
    }

    const rows = await prisma.jiraTicket.findMany({
        where: { importPeriod: periodLabel },
        select: { ticketId: true, createdAt: true, customFields: true, issueType: true, summary: true },
    });

    console.log(`\n=== Tickets with importPeriod = "${periodLabel}" ===`);
    console.log(`Total imported: ${rows.length}`);
    if (rows.length === 0) {
        console.log('(no tickets imported for this period)');
        return;
    }

    const dbCreatedAt = rows.map(r => r.createdAt).sort((a, b) => a.getTime() - b.getTime());
    console.log(`\nDB row createdAt range (when the ticket landed in our DB during the import run):`);
    console.log(`  earliest: ${dbCreatedAt[0].toISOString()}`);
    console.log(`  latest:   ${dbCreatedAt[dbCreatedAt.length - 1].toISOString()}`);

    // Count how many distinct "import runs" happened, by clustering createdAt into 5-minute buckets
    const buckets = new Map<string, number>();
    for (const r of rows) {
        const bucket = new Date(Math.floor(r.createdAt.getTime() / (5 * 60 * 1000)) * 5 * 60 * 1000).toISOString();
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    console.log(`\nApparent import runs (5-min clusters of DB createdAt):`);
    for (const [bucket, n] of Array.from(buckets.entries()).sort()) {
        console.log(`  ${bucket}  →  ${n} tickets`);
    }

    // What's the latest Jira-created ticket that made it into this import?
    // (uses customFields.Created if present, else falls back to nothing)
    const withJiraCreated = rows
        .map(r => {
            const cf = r.customFields as Record<string, string> | null;
            const c = cf?.Created || cf?.created;
            return c ? { ticketId: r.ticketId, jiraCreated: new Date(c), summary: r.summary, issueType: r.issueType } : null;
        })
        .filter((x): x is { ticketId: string; jiraCreated: Date; summary: string; issueType: string } => !!x && !isNaN(x.jiraCreated.getTime()))
        .sort((a, b) => b.jiraCreated.getTime() - a.jiraCreated.getTime());

    if (withJiraCreated.length > 0) {
        console.log(`\nLatest Jira-created tickets that DID land in this import:`);
        for (const r of withJiraCreated.slice(0, 10)) {
            console.log(`  ${r.jiraCreated.toISOString()}  ${r.ticketId}  [${r.issueType}]  ${r.summary.slice(0, 60)}`);
        }
        const latest = withJiraCreated[0].jiraCreated;
        console.log(`\nLatest Jira-created date among imported tickets: ${latest.toISOString()}`);
        console.log(`If your missing ticket was created AFTER this date, the import was run before it existed.`);
    }
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
