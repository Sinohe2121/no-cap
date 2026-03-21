const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Simple period check
    const period = await prisma.accountingPeriod.findFirst({ where: { month: 2, year: 2026 } });
    console.log('Period:', period ? 'found' : 'NOT found');
    if (period) {
        console.log('  totalCapitalized: $' + period.totalCapitalized.toFixed(2));
        console.log('  totalExpensed: $' + period.totalExpensed.toFixed(2));
        console.log('  totalAmortization: $' + period.totalAmortization.toFixed(2));
    }

    // Simple entry count by type
    const entries = await prisma.journalEntry.groupBy({
        by: ['entryType'],
        where: { periodId: period.id },
        _sum: { amount: true },
        _count: true,
    });
    console.log('\nJournal entries:');
    for (const e of entries) {
        console.log('  ' + e.entryType + ': ' + e._count + ' entries, $' + (e._sum.amount || 0).toFixed(2));
    }

    // Check capitalized tickets
    const capSum = await prisma.jiraTicket.aggregate({
        _sum: { capitalizedAmount: true },
        _count: true,
        where: { capitalizedAmount: { gt: 0 } },
    });
    console.log('\nTickets with capitalizedAmount > 0: ' + capSum._count);
    console.log('Total capitalizedAmount: $' + (capSum._sum.capitalizedAmount || 0).toFixed(2));

    // Check which projects have capitalization entries
    const capEntries = await prisma.journalEntry.findMany({
        where: { periodId: period.id, entryType: 'CAPITALIZATION' },
        include: { project: { select: { name: true, status: true, isCapitalizable: true } } },
    });
    console.log('\nCapitalization entries by project:');
    for (const e of capEntries) {
        console.log('  ' + e.project.name + ' [status=' + e.project.status + ', isCap=' + e.project.isCapitalizable + ']: $' + e.amount.toFixed(2));
    }

    // Check total developer loaded costs
    const devs = await prisma.developer.findMany({ where: { isActive: true } });
    let totalLoaded = 0;
    for (const d of devs) {
        const loaded = d.monthlySalary + (d.monthlySalary * d.fringeBenefitRate) + d.stockCompAllocation;
        totalLoaded += loaded;
    }
    console.log('\nActive devs: ' + devs.length + ', total monthly loaded cost: $' + totalLoaded.toFixed(2));
    console.log('Cap + Exp should roughly equal this: $' + (period.totalCapitalized + period.totalExpensed).toFixed(2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
