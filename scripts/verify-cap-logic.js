/**
 * Quick verification script to test the new capitalization methodology.
 * Run with: npx tsx scripts/verify-cap-logic.ts
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const month = 2, year = 2026;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    console.log(`\n=== Verifying ticket selection for ${month}/${year} ===`);
    console.log(`Period: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

    const totalTickets = await prisma.jiraTicket.count();
    console.log(`Total tickets in DB: ${totalTickets}`);

    const resolvedDuringPeriod = await prisma.jiraTicket.count({
        where: { resolutionDate: { gte: startDate, lte: endDate } },
    });
    console.log(`OLD selection (resolved during period): ${resolvedDuringPeriod} tickets`);

    const openDuringPeriod = await prisma.jiraTicket.count({
        where: {
            OR: [
                { resolutionDate: null },
                { resolutionDate: { gte: startDate, lte: endDate } },
            ],
        },
    });
    console.log(`NEW selection (open during period): ${openDuringPeriod} tickets`);

    const stillOpen = await prisma.jiraTicket.count({ where: { resolutionDate: null } });
    console.log(`  - Still open (no resolution date): ${stillOpen}`);
    console.log(`  - Resolved during period: ${resolvedDuringPeriod}`);

    const ticketsWithCap = await prisma.jiraTicket.count({
        where: { capitalizedAmount: { gt: 0 } },
    });
    console.log(`\nTickets with capitalizedAmount > 0: ${ticketsWithCap}`);

    const period = await prisma.accountingPeriod.findFirst({ where: { month, year } });
    if (period) {
        const entries = await prisma.journalEntry.groupBy({
            by: ['entryType'],
            where: { periodId: period.id },
            _sum: { amount: true },
            _count: true,
        });
        console.log(`\nJournal entries for ${month}/${year}:`);
        for (const e of entries) {
            console.log(`  ${e.entryType}: ${e._count} entries, total $${(e._sum.amount || 0).toFixed(2)}`);
        }
    } else {
        console.log('\nNo accounting period exists yet — needs generation through the UI.');
    }

    console.log('\n=== Verification complete ===\n');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
