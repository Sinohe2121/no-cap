import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding No Cap database...');

    // ─── Global Config ────────────────────────────────────────
    const configs = [
        { key: 'FRINGE_BENEFIT_RATE', value: '0.25', label: 'Fringe Benefit Rate (multiplier on salary)' },
        { key: 'DEFAULT_AMORTIZATION_LIFE', value: '36', label: 'Default Amortization Life (months)' },
        { key: 'CAPITALIZATION_THRESHOLD', value: '0', label: 'Capitalization Threshold Override ($)' },
    ];
    for (const c of configs) {
        await prisma.globalConfig.upsert({
            where: { key: c.key },
            update: { value: c.value, label: c.label },
            create: c,
        });
    }

    // ─── Admin User ───────────────────────────────────────────
    const passwordHash = await bcrypt.hash('admin123', 10);
    await prisma.user.upsert({
        where: { email: 'admin@nocap.io' },
        update: {},
        create: { email: 'admin@nocap.io', name: 'System Admin', passwordHash, role: 'ADMIN' },
    });

    // ─── Developers ───────────────────────────────────────────
    const devs = [
        { name: 'Alice Chen', email: 'alice@company.com', jiraUserId: 'achen', role: 'ENG', monthlySalary: 15000, stockCompAllocation: 2000 },
        { name: 'Bob Martinez', email: 'bob@company.com', jiraUserId: 'bmartinez', role: 'ENG', monthlySalary: 14000, stockCompAllocation: 1800 },
        { name: 'Carol Davis', email: 'carol@company.com', jiraUserId: 'cdavis', role: 'ENG', monthlySalary: 16000, stockCompAllocation: 2500 },
        { name: 'Dan Kim', email: 'dan@company.com', jiraUserId: 'dkim', role: 'PRODUCT', monthlySalary: 13000, stockCompAllocation: 1500 },
        { name: 'Eva Thompson', email: 'eva@company.com', jiraUserId: 'ethompson', role: 'DESIGN', monthlySalary: 12000, stockCompAllocation: 1200 },
    ];

    const createdDevs: Record<string, string> = {};
    for (const d of devs) {
        const dev = await prisma.developer.upsert({
            where: { email: d.email },
            update: {},
            create: { ...d, fringeBenefitRate: 0.25 },
        });
        createdDevs[d.jiraUserId] = dev.id;
    }

    // ─── Projects ─────────────────────────────────────────────
    const projects = [
        { name: 'Payment Gateway v2', description: 'Rebuild payment processing with Stripe', epicKey: 'PAY', status: 'LIVE', isCapitalizable: true, startDate: new Date('2025-01-15'), launchDate: new Date('2025-09-01'), startingBalance: 45000, startingAmortization: 5000 },
        { name: 'Customer Portal', description: 'Self-service customer dashboard', epicKey: 'CPRT', status: 'DEV', isCapitalizable: true, startDate: new Date('2025-06-01'), launchDate: null },
        { name: 'AI Recommendations', description: 'ML-powered product suggestions', epicKey: 'AIREC', status: 'PLANNING', isCapitalizable: false, startDate: new Date('2025-11-01'), launchDate: null },
        { name: 'Inventory System', description: 'Real-time inventory management', epicKey: 'INV', status: 'LIVE', isCapitalizable: true, startDate: new Date('2024-06-01'), launchDate: new Date('2025-03-01'), startingBalance: 82000, startingAmortization: 18222 },
    ];

    const createdProjects: Record<string, string> = {};
    for (const p of projects) {
        const proj = await prisma.project.upsert({
            where: { epicKey: p.epicKey },
            update: {},
            create: { ...p, amortizationMonths: 36, accumulatedCost: p.startingBalance || 0 },
        });
        createdProjects[p.epicKey] = proj.id;
    }

    // ─── Jira Tickets (realistic mix of stories & bugs) ──────
    const tickets = [
        // Payment Gateway — mostly stories (it's live, so historical)
        { ticketId: 'PAY-101', epicKey: 'PAY', issueType: 'STORY', summary: 'Implement Stripe checkout flow', storyPoints: 8, assignee: 'achen', resolutionDate: new Date('2025-07-15') },
        { ticketId: 'PAY-102', epicKey: 'PAY', issueType: 'STORY', summary: 'Add webhook handlers for payments', storyPoints: 5, assignee: 'bmartinez', resolutionDate: new Date('2025-07-20') },
        { ticketId: 'PAY-103', epicKey: 'PAY', issueType: 'BUG', summary: 'Fix duplicate charge on retry', storyPoints: 3, assignee: 'achen', resolutionDate: new Date('2025-08-01') },
        { ticketId: 'PAY-104', epicKey: 'PAY', issueType: 'STORY', summary: 'Subscription billing engine', storyPoints: 13, assignee: 'cdavis', resolutionDate: new Date('2025-08-10') },
        { ticketId: 'PAY-105', epicKey: 'PAY', issueType: 'BUG', summary: 'Currency rounding error', storyPoints: 2, assignee: 'bmartinez', resolutionDate: new Date('2025-08-15') },
        { ticketId: 'PAY-106', epicKey: 'PAY', issueType: 'STORY', summary: 'Invoice PDF generation', storyPoints: 5, assignee: 'ethompson', resolutionDate: new Date('2025-08-20') },

        // Customer Portal — in development
        { ticketId: 'CPRT-201', epicKey: 'CPRT', issueType: 'STORY', summary: 'User dashboard wireframes', storyPoints: 5, assignee: 'ethompson', resolutionDate: new Date('2025-12-01') },
        { ticketId: 'CPRT-202', epicKey: 'CPRT', issueType: 'STORY', summary: 'Account settings page', storyPoints: 8, assignee: 'achen', resolutionDate: new Date('2025-12-15') },
        { ticketId: 'CPRT-203', epicKey: 'CPRT', issueType: 'STORY', summary: 'Order history component', storyPoints: 5, assignee: 'bmartinez', resolutionDate: new Date('2026-01-05') },
        { ticketId: 'CPRT-204', epicKey: 'CPRT', issueType: 'BUG', summary: 'Login redirect loop fix', storyPoints: 2, assignee: 'cdavis', resolutionDate: new Date('2026-01-10') },
        { ticketId: 'CPRT-205', epicKey: 'CPRT', issueType: 'STORY', summary: 'Notification preferences', storyPoints: 3, assignee: 'dkim', resolutionDate: new Date('2026-01-15') },
        { ticketId: 'CPRT-206', epicKey: 'CPRT', issueType: 'STORY', summary: 'Support ticket submission', storyPoints: 8, assignee: 'achen', resolutionDate: new Date('2026-01-20') },
        { ticketId: 'CPRT-207', epicKey: 'CPRT', issueType: 'TASK', summary: 'CI/CD pipeline setup', storyPoints: 3, assignee: 'bmartinez', resolutionDate: new Date('2026-01-25') },
        { ticketId: 'CPRT-208', epicKey: 'CPRT', issueType: 'STORY', summary: 'Billing history page', storyPoints: 5, assignee: 'cdavis', resolutionDate: new Date('2026-02-01') },

        // AI Recommendations — planning phase (all expensed)
        { ticketId: 'AIREC-301', epicKey: 'AIREC', issueType: 'TASK', summary: 'Research ML frameworks', storyPoints: 3, assignee: 'dkim', resolutionDate: new Date('2026-01-20') },
        { ticketId: 'AIREC-302', epicKey: 'AIREC', issueType: 'TASK', summary: 'Data pipeline architecture doc', storyPoints: 5, assignee: 'achen', resolutionDate: new Date('2026-01-28') },

        // Inventory System — live, maintenance tickets
        { ticketId: 'INV-401', epicKey: 'INV', issueType: 'BUG', summary: 'Stock count sync delay', storyPoints: 3, assignee: 'bmartinez', resolutionDate: new Date('2025-12-05') },
        { ticketId: 'INV-402', epicKey: 'INV', issueType: 'BUG', summary: 'Barcode scanner compatibility', storyPoints: 2, assignee: 'cdavis', resolutionDate: new Date('2025-12-20') },
        { ticketId: 'INV-403', epicKey: 'INV', issueType: 'STORY', summary: 'Batch import from warehouse API', storyPoints: 8, assignee: 'achen', resolutionDate: new Date('2026-01-10') },
        { ticketId: 'INV-404', epicKey: 'INV', issueType: 'BUG', summary: 'Negative stock display bug', storyPoints: 1, assignee: 'bmartinez', resolutionDate: new Date('2026-01-15') },

        // More recent tickets for variety
        { ticketId: 'CPRT-209', epicKey: 'CPRT', issueType: 'STORY', summary: 'Multi-language support', storyPoints: 13, assignee: 'cdavis', resolutionDate: new Date('2026-02-05') },
        { ticketId: 'CPRT-210', epicKey: 'CPRT', issueType: 'BUG', summary: 'Mobile responsive issues', storyPoints: 3, assignee: 'ethompson', resolutionDate: new Date('2026-02-10') },
        { ticketId: 'PAY-107', epicKey: 'PAY', issueType: 'BUG', summary: 'Refund status not updating', storyPoints: 2, assignee: 'achen', resolutionDate: new Date('2026-02-12') },
        { ticketId: 'INV-405', epicKey: 'INV', issueType: 'STORY', summary: 'Real-time stock level dashboard', storyPoints: 5, assignee: 'dkim', resolutionDate: new Date('2026-02-14') },
    ];

    for (const t of tickets) {
        await prisma.jiraTicket.upsert({
            where: { ticketId: t.ticketId },
            update: {},
            create: {
                ticketId: t.ticketId,
                epicKey: t.epicKey,
                issueType: t.issueType,
                summary: t.summary,
                storyPoints: t.storyPoints,
                resolutionDate: t.resolutionDate,
                assigneeId: createdDevs[t.assignee],
                projectId: createdProjects[t.epicKey],
            },
        });
    }

    // ─── Accounting Periods ───────────────────────────────────
    const periods = [
        { month: 12, year: 2025, status: 'CLOSED', totalCapitalized: 42500, totalExpensed: 18200, totalAmortization: 4861 },
        { month: 1, year: 2026, status: 'CLOSED', totalCapitalized: 38900, totalExpensed: 21300, totalAmortization: 4861 },
        { month: 2, year: 2026, status: 'OPEN', totalCapitalized: 0, totalExpensed: 0, totalAmortization: 0 },
    ];

    for (const p of periods) {
        await prisma.accountingPeriod.upsert({
            where: { month_year: { month: p.month, year: p.year } },
            update: {},
            create: p,
        });
    }

    console.log('✅ Seed complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
