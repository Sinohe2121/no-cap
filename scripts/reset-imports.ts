import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('🗑  Clearing imported data...');

    // Must delete in dependency order (children before parents)

    // 1. Audit trails reference journal entries & tickets — cascade handles JE side,
    //    but we delete explicitly to be safe
    const trails = await prisma.auditTrail.deleteMany({});
    console.log(`  ✓ Deleted ${trails.count} audit trail records`);

    // 2. Journal entries (audit trails already gone)
    const je = await prisma.journalEntry.deleteMany({});
    console.log(`  ✓ Deleted ${je.count} journal entries`);

    // 3. Accounting periods
    const ap = await prisma.accountingPeriod.deleteMany({});
    console.log(`  ✓ Deleted ${ap.count} accounting periods`);

    // 4. Jira tickets
    const tickets = await prisma.jiraTicket.deleteMany({});
    console.log(`  ✓ Deleted ${tickets.count} Jira tickets`);

    // 5. Payroll entries (reference payroll imports & developers)
    const pe = await prisma.payrollEntry.deleteMany({});
    console.log(`  ✓ Deleted ${pe.count} payroll entries`);

    // 6. Payroll imports
    const pi = await prisma.payrollImport.deleteMany({});
    console.log(`  ✓ Deleted ${pi.count} payroll imports`);

    // 7. Clear self-referencing parentProjectId before deleting projects
    await prisma.project.updateMany({ data: { parentProjectId: null } });

    // 8. Delete all projects (auto-recreated on Jira import)
    const projects = await prisma.project.deleteMany({});
    console.log(`  ✓ Deleted ${projects.count} projects`);

    console.log('');
    console.log('✅ Done! Kept: developers, users, global configs, LLM config.');
    console.log('   Projects, payroll, and tickets will all be recreated on reimport.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
