import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🗑  Scrubbing existing data...');

    // Hard reset — delete in dependency order
    await prisma.auditTrail.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.jiraTicket.deleteMany();
    await prisma.payrollEntry.deleteMany();
    await prisma.payrollImport.deleteMany();
    await prisma.accountingPeriod.deleteMany();
    await prisma.project.deleteMany();
    await prisma.developer.deleteMany();
    await prisma.gitHubEvent.deleteMany();
    await prisma.gitHubRepo.deleteMany();
    await prisma.soc2Evidence.deleteMany();
    await prisma.soc2Control.deleteMany();
    await prisma.soc2RiskItem.deleteMany();
    await prisma.soc2IncidentLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.globalConfig.deleteMany();

    console.log('✅ Data cleared.');

    // ─────────────────────────────────────────────────────────────────────────
    // 1. GLOBAL CONFIG
    // ─────────────────────────────────────────────────────────────────────────
    const configs = [
        { key: 'FRINGE_BENEFIT_RATE',       value: '0.28',       label: 'Fringe Benefit Rate (multiplier on salary)' },
        { key: 'DEFAULT_AMORTIZATION_LIFE', value: '36',         label: 'Default Amortization Life (months)' },
        { key: 'CAPITALIZATION_THRESHOLD',  value: '0',          label: 'Capitalization Threshold Override ($)' },
        { key: 'ACCOUNTING_STANDARD',       value: 'ASC_350_40', label: 'Active Accounting Standard' },
    ];
    for (const c of configs) {
        await prisma.globalConfig.create({ data: c });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. ADMIN USERS
    // ─────────────────────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
        data: { email: 'admin@acme.io', name: 'Finance Admin', passwordHash, role: 'ADMIN' },
    });
    await prisma.user.create({
        data: { email: 'viewer@acme.io', name: 'Eng Manager', passwordHash: await bcrypt.hash('viewer123', 10), role: 'VIEWER' },
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. DEVELOPERS — Jan + Feb roster  (16 people)
    //    March changes: 2 leave, 4 new join  → total 20 dev records
    // ─────────────────────────────────────────────────────────────────────────

    // All roles: ENG | PRODUCT | DESIGN
    const janFebRoster = [
        // ─ Engineers (10)
        { name: 'Alice Chen',       email: 'alice@acme.io',    jiraUserId: 'achen',     role: 'ENG',     monthlySalary: 16500, stockCompAllocation: 2500, fringeBenefitRate: 0.28 },
        { name: 'Bob Martinez',     email: 'bob@acme.io',      jiraUserId: 'bmartinez', role: 'ENG',     monthlySalary: 15000, stockCompAllocation: 2000, fringeBenefitRate: 0.28 },
        { name: 'Carol Davis',      email: 'carol@acme.io',    jiraUserId: 'cdavis',    role: 'ENG',     monthlySalary: 17500, stockCompAllocation: 3000, fringeBenefitRate: 0.28 },
        { name: 'Ethan Williams',   email: 'ethan@acme.io',    jiraUserId: 'ewilliams', role: 'ENG',     monthlySalary: 14000, stockCompAllocation: 1800, fringeBenefitRate: 0.28 },
        { name: 'Fiona Park',       email: 'fiona@acme.io',    jiraUserId: 'fpark',     role: 'ENG',     monthlySalary: 13500, stockCompAllocation: 1500, fringeBenefitRate: 0.28 },
        { name: 'George Osei',      email: 'george@acme.io',   jiraUserId: 'gosei',     role: 'ENG',     monthlySalary: 15500, stockCompAllocation: 2200, fringeBenefitRate: 0.28 },
        { name: 'Hannah Lima',      email: 'hannah@acme.io',   jiraUserId: 'hlima',     role: 'ENG',     monthlySalary: 13000, stockCompAllocation: 1600, fringeBenefitRate: 0.28 },
        { name: 'Ivan Petrov',      email: 'ivan@acme.io',     jiraUserId: 'ipetrov',   role: 'ENG',     monthlySalary: 16000, stockCompAllocation: 2300, fringeBenefitRate: 0.28 },
        // Feb only — will leave in March
        { name: 'Jade Liu',         email: 'jade@acme.io',     jiraUserId: 'jliu',      role: 'ENG',     monthlySalary: 14500, stockCompAllocation: 1900, fringeBenefitRate: 0.28 },
        { name: 'Kevin O\'Brien',   email: 'kevin@acme.io',    jiraUserId: 'kobrien',   role: 'ENG',     monthlySalary: 15200, stockCompAllocation: 2100, fringeBenefitRate: 0.28 },
        // ─ Product (4)
        { name: 'Laura Nguyen',     email: 'laura@acme.io',    jiraUserId: 'lnguyen',   role: 'PRODUCT', monthlySalary: 14000, stockCompAllocation: 1800, fringeBenefitRate: 0.28 },
        { name: 'Marcus Bell',      email: 'marcus@acme.io',   jiraUserId: 'mbell',     role: 'PRODUCT', monthlySalary: 13500, stockCompAllocation: 1700, fringeBenefitRate: 0.28 },
        { name: 'Nina Patel',       email: 'nina@acme.io',     jiraUserId: 'npatel',    role: 'PRODUCT', monthlySalary: 14500, stockCompAllocation: 2000, fringeBenefitRate: 0.28 },
        { name: 'Omar Diallo',      email: 'omar@acme.io',     jiraUserId: 'odiallo',   role: 'PRODUCT', monthlySalary: 13000, stockCompAllocation: 1500, fringeBenefitRate: 0.28 },
        // ─ Design (2)
        { name: 'Priya Sharma',     email: 'priya@acme.io',    jiraUserId: 'psharma',   role: 'DESIGN',  monthlySalary: 12500, stockCompAllocation: 1400, fringeBenefitRate: 0.28 },
        { name: 'Quinn Torres',     email: 'quinn@acme.io',    jiraUserId: 'qtorres',   role: 'DESIGN',  monthlySalary: 12000, stockCompAllocation: 1300, fringeBenefitRate: 0.28 },
    ];

    // March new hires (joined 2026-03-03)
    const marchNewHires = [
        { name: 'Rachel Kim',       email: 'rachel@acme.io',   jiraUserId: 'rkim',      role: 'ENG',     monthlySalary: 15000, stockCompAllocation: 2000, fringeBenefitRate: 0.28 },
        { name: 'Sam Adeyemi',      email: 'sam@acme.io',      jiraUserId: 'sadeyemi',  role: 'ENG',     monthlySalary: 13000, stockCompAllocation: 1500, fringeBenefitRate: 0.28 },
        { name: 'Tara Svensson',    email: 'tara@acme.io',     jiraUserId: 'tsvensson', role: 'ENG',     monthlySalary: 14000, stockCompAllocation: 1800, fringeBenefitRate: 0.28 },
        { name: 'Ugo Mensah',       email: 'ugo@acme.io',      jiraUserId: 'umensah',   role: 'DESIGN',  monthlySalary: 12500, stockCompAllocation: 1400, fringeBenefitRate: 0.28 },
    ];

    // Jade & Kevin leave in March — we mark them inactive
    const marchDepartures = new Set(['jliu', 'kobrien']);

    const devIds: Record<string, string> = {};

    for (const d of [...janFebRoster, ...marchNewHires]) {
        const isMarLeavers = marchDepartures.has(d.jiraUserId);
        // March leavers stay in DB but go inactive after Feb
        const dev = await prisma.developer.create({
            data: { ...d, isActive: !isMarLeavers },
        });
        devIds[d.jiraUserId] = dev.id;
    }

    console.log('👥 Developers created:', Object.keys(devIds).length);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. PROJECTS
    // ─────────────────────────────────────────────────────────────────────────
    //  NOVA — live (launched Aug 2025), 36-month amort, capitalizable
    //  PORTAL — active DEV, capitalizable, not yet launched
    //  MOBILE — active DEV, capitalizable, not yet launched, mgmtAuthorized
    //  INFRA — active DEV, NOT capitalizable (maintenance/infra)
    //  LEGACY — RETIRED, capitalizable, still amortizing
    //  ANALYTICS — PLANNING, capitalizable (not eligible to capitalize yet)

    const projects = [
        {
            name: 'Nova Commerce Platform',
            description: 'Full e-commerce rebuild — launched GA Aug 2025. Amortization runs through Aug 2028.',
            epicKey: 'NOVA',
            status: 'LIVE',
            isCapitalizable: true,
            amortizationMonths: 36,
            startDate: new Date('2024-09-01'),
            launchDate: new Date('2025-08-01'),
            startingBalance: 387500,   // total capitalized through launch
            startingAmortization: 53819, // 5 months amort pre-seed (Aug–Dec 2025). Monthly = $387,500/36 = $10,764
            accumulatedCost: 0,          // 0 here — startingBalance already IS the full cost basis
            budgetTarget: 35000,
            mgmtAuthorized: true,
            probableToComplete: true,
        },
        {
            name: 'Customer Portal',
            description: 'Self-service customer dashboard. In active development, targeting Q3 2026 launch.',
            epicKey: 'PORTAL',
            status: 'DEV',
            isCapitalizable: true,
            amortizationMonths: 36,
            startDate: new Date('2025-07-01'),
            launchDate: null,
            startingBalance: 0,
            accumulatedCost: 0,
            budgetTarget: 28000,
            mgmtAuthorized: true,
            probableToComplete: true,
        },
        {
            name: 'Mobile App v2',
            description: 'iOS & Android rebuild with React Native. Targeting Q4 2026.',
            epicKey: 'MOBILE',
            status: 'DEV',
            isCapitalizable: true,
            amortizationMonths: 36,
            startDate: new Date('2025-10-01'),
            launchDate: null,
            startingBalance: 0,
            accumulatedCost: 0,
            budgetTarget: 22000,
            mgmtAuthorized: true,
            probableToComplete: false, // probableToComplete off — ASU 2025-06 won't capitalize this
        },
        {
            name: 'Infrastructure & DevOps',
            description: 'Platform reliability, observability, and CI/CD improvements. NOT capitalizable — maintenance.',
            epicKey: 'INFRA',
            status: 'DEV',
            isCapitalizable: false,
            amortizationMonths: 36,
            startDate: new Date('2025-01-01'),
            launchDate: null,
            startingBalance: 0,
            accumulatedCost: 0,
        },
        {
            name: 'Legacy Inventory System',
            description: 'Original inventory system — retired Dec 2025. Still in 3-year amortization window.',
            epicKey: 'LEGACY',
            status: 'RETIRED',
            isCapitalizable: true,
            amortizationMonths: 36,
            startDate: new Date('2022-01-01'),
            launchDate: new Date('2023-03-01'),
            startingBalance: 215000,
            startingAmortization: 143333, // ~22 months amortized pre-seed. Monthly = $215,000/36 = $5,972
            accumulatedCost: 0,           // 0 here — startingBalance already IS the full cost basis
        },
        {
            name: 'Analytics Dashboard',
            description: 'Internal analytics & reporting platform. Pre-approval stage — R&D phase, expensing all costs.',
            epicKey: 'ANALYTICS',
            status: 'PLANNING',
            isCapitalizable: false, // PLANNING — not capitalizable yet
            amortizationMonths: 36,
            startDate: new Date('2026-01-15'),
            launchDate: null,
            startingBalance: 0,
            accumulatedCost: 0,
        },
    ];

    const projectIds: Record<string, string> = {};
    for (const p of projects) {
        const proj = await prisma.project.create({ data: p });
        projectIds[p.epicKey] = proj.id;
    }
    console.log('📁 Projects created:', Object.keys(projectIds).length);

    // ─────────────────────────────────────────────────────────────────────────
    // 5. PAYROLL IMPORTS — Jan, Feb, March 2026
    // ─────────────────────────────────────────────────────────────────────────

    // Jan: full janFebRoster (16 people)
    // Feb: full janFebRoster (16 people, incl Jade & Kevin who leave in Mar)
    // Mar: janFebRoster minus Jade+Kevin PLUS 4 new hires (prorated ~87.5%)

    const janImport = await prisma.payrollImport.create({
        data: { label: 'January 2026', payDate: new Date('2026-01-31'), year: 2026 },
    });
    const febImport = await prisma.payrollImport.create({
        data: { label: 'February 2026', payDate: new Date('2026-02-28'), year: 2026 },
    });
    const marImport = await prisma.payrollImport.create({
        data: { label: 'March 2026', payDate: new Date('2026-03-31'), year: 2026 },
    });

    // Jan & Feb payroll
    for (const d of janFebRoster) {
        await prisma.payrollEntry.createMany({
            data: [
                { developerId: devIds[d.jiraUserId], payrollImportId: janImport.id, grossSalary: d.monthlySalary },
                { developerId: devIds[d.jiraUserId], payrollImportId: febImport.id, grossSalary: d.monthlySalary },
            ],
        });
    }

    // March payroll — leavers get 0 (left Mar 1), new hires get prorated (started Mar 3, ~29/31 days)
    for (const d of janFebRoster) {
        if (!marchDepartures.has(d.jiraUserId)) {
            await prisma.payrollEntry.create({
                data: { developerId: devIds[d.jiraUserId], payrollImportId: marImport.id, grossSalary: d.monthlySalary },
            });
        }
    }
    for (const d of marchNewHires) {
        // Prorated: joined Mar 3 = 29/31 of month
        const prorated = Math.round(d.monthlySalary * (29 / 31));
        await prisma.payrollEntry.create({
            data: { developerId: devIds[d.jiraUserId], payrollImportId: marImport.id, grossSalary: prorated },
        });
    }

    console.log('💰 Payroll imports created: Jan, Feb, March');

    // ─────────────────────────────────────────────────────────────────────────
    // 6. JIRA TICKETS — Q1 2026 + Dec 2025 history
    // ─────────────────────────────────────────────────────────────────────────
    // ticket helper
    type Ticket = {
        ticketId: string; epicKey: string; issueType: string; summary: string;
        storyPoints: number; assignee: string; resolutionDate: Date;
    };

    const tickets: Ticket[] = [

        // ── NOVA — LIVE, capitalizable. Post-launch: bugs expensed, stories capitalized ────
        { ticketId: 'NOVA-101', epicKey: 'NOVA', issueType: 'STORY', summary: 'Search result ranking improvements', storyPoints: 8, assignee: 'achen', resolutionDate: new Date('2025-12-10') },
        { ticketId: 'NOVA-102', epicKey: 'NOVA', issueType: 'BUG', summary: 'Checkout price mismatch on promo codes', storyPoints: 3, assignee: 'bmartinez', resolutionDate: new Date('2025-12-12') },
        { ticketId: 'NOVA-103', epicKey: 'NOVA', issueType: 'STORY', summary: 'Saved cart persistence across sessions', storyPoints: 5, assignee: 'cdavis', resolutionDate: new Date('2025-12-18') },
        { ticketId: 'NOVA-104', epicKey: 'NOVA', issueType: 'BUG', summary: 'Payment timeout on slow networks', storyPoints: 2, assignee: 'ewilliams', resolutionDate: new Date('2025-12-20') },
        { ticketId: 'NOVA-105', epicKey: 'NOVA', issueType: 'STORY', summary: 'Product comparison feature', storyPoints: 13, assignee: 'fpark', resolutionDate: new Date('2025-12-28') },
        // Jan 2026
        { ticketId: 'NOVA-106', epicKey: 'NOVA', issueType: 'STORY', summary: 'Wishlist social sharing', storyPoints: 5, assignee: 'achen', resolutionDate: new Date('2026-01-05') },
        { ticketId: 'NOVA-107', epicKey: 'NOVA', issueType: 'BUG', summary: 'Image carousel broken on Safari', storyPoints: 2, assignee: 'fpark', resolutionDate: new Date('2026-01-08') },
        { ticketId: 'NOVA-108', epicKey: 'NOVA', issueType: 'STORY', summary: 'Bulk order import via CSV', storyPoints: 8, assignee: 'gosei', resolutionDate: new Date('2026-01-12') },
        { ticketId: 'NOVA-109', epicKey: 'NOVA', issueType: 'BUG', summary: 'Inventory sync lag on flash sales', storyPoints: 3, assignee: 'hlima', resolutionDate: new Date('2026-01-15') },
        { ticketId: 'NOVA-110', epicKey: 'NOVA', issueType: 'STORY', summary: 'Advanced product filter UI', storyPoints: 8, assignee: 'ipetrov', resolutionDate: new Date('2026-01-18') },
        { ticketId: 'NOVA-111', epicKey: 'NOVA', issueType: 'STORY', summary: 'Email notification preferences center', storyPoints: 5, assignee: 'lnguyen', resolutionDate: new Date('2026-01-22') },
        { ticketId: 'NOVA-112', epicKey: 'NOVA', issueType: 'BUG', summary: 'Order status webhook not firing', storyPoints: 3, assignee: 'bmartinez', resolutionDate: new Date('2026-01-25') },
        { ticketId: 'NOVA-113', epicKey: 'NOVA', issueType: 'STORY', summary: 'Guest checkout flow redisign', storyPoints: 8, assignee: 'psharma', resolutionDate: new Date('2026-01-28') },
        // Feb 2026
        { ticketId: 'NOVA-114', epicKey: 'NOVA', issueType: 'BUG', summary: 'Return label generation timeout', storyPoints: 2, assignee: 'cdavis', resolutionDate: new Date('2026-02-03') },
        { ticketId: 'NOVA-115', epicKey: 'NOVA', issueType: 'STORY', summary: 'Subscription product catalog', storyPoints: 13, assignee: 'achen', resolutionDate: new Date('2026-02-07') },
        { ticketId: 'NOVA-116', epicKey: 'NOVA', issueType: 'STORY', summary: 'A/B testing framework integration', storyPoints: 8, assignee: 'ewilliams', resolutionDate: new Date('2026-02-11') },
        { ticketId: 'NOVA-117', epicKey: 'NOVA', issueType: 'BUG', summary: 'Coupon stack discount bug', storyPoints: 3, assignee: 'gosei', resolutionDate: new Date('2026-02-14') },
        { ticketId: 'NOVA-118', epicKey: 'NOVA', issueType: 'STORY', summary: 'Dynamic pricing engine MVP', storyPoints: 13, assignee: 'ipetrov', resolutionDate: new Date('2026-02-18') },
        { ticketId: 'NOVA-119', epicKey: 'NOVA', issueType: 'STORY', summary: 'Cross-sell recommendation blocks', storyPoints: 8, assignee: 'fpark', resolutionDate: new Date('2026-02-21') },
        { ticketId: 'NOVA-120', epicKey: 'NOVA', issueType: 'BUG', summary: 'Pagination skips items on sort change', storyPoints: 2, assignee: 'hlima', resolutionDate: new Date('2026-02-25') },
        // March 2026
        { ticketId: 'NOVA-121', epicKey: 'NOVA', issueType: 'STORY', summary: 'Gift card module', storyPoints: 8, assignee: 'achen', resolutionDate: new Date('2026-03-04') },
        { ticketId: 'NOVA-122', epicKey: 'NOVA', issueType: 'BUG', summary: 'Mobile keyboard overlaps checkout form', storyPoints: 2, assignee: 'rkim', resolutionDate: new Date('2026-03-06') },
        { ticketId: 'NOVA-123', epicKey: 'NOVA', issueType: 'STORY', summary: 'Live chat widget integration', storyPoints: 5, assignee: 'sadeyemi', resolutionDate: new Date('2026-03-10') },
        { ticketId: 'NOVA-124', epicKey: 'NOVA', issueType: 'STORY', summary: 'Abandoned cart recovery emails', storyPoints: 8, assignee: 'cdavis', resolutionDate: new Date('2026-03-14') },
        { ticketId: 'NOVA-125', epicKey: 'NOVA', issueType: 'BUG', summary: 'Tax calculation off for EU orders', storyPoints: 3, assignee: 'ewilliams', resolutionDate: new Date('2026-03-18') },
        { ticketId: 'NOVA-126', epicKey: 'NOVA', issueType: 'STORY', summary: 'Product review moderation queue', storyPoints: 5, assignee: 'tara@acme.io'.includes('@') ? 'tsvensson' : 'tsvensson', resolutionDate: new Date('2026-03-22') },
        { ticketId: 'NOVA-127', epicKey: 'NOVA', issueType: 'STORY', summary: 'Storefront analytics dashboard', storyPoints: 8, assignee: 'gosei', resolutionDate: new Date('2026-03-28') },

        // ── PORTAL — DEV, capitalizable. All stories capitalized ───────────────
        // Dec 2025
        { ticketId: 'PORTAL-101', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Authentication & SSO integration', storyPoints: 13, assignee: 'bmartinez', resolutionDate: new Date('2025-12-08') },
        { ticketId: 'PORTAL-102', epicKey: 'PORTAL', issueType: 'STORY', summary: 'User profile management', storyPoints: 8, assignee: 'jliu', resolutionDate: new Date('2025-12-15') },
        { ticketId: 'PORTAL-103', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Document upload & viewer', storyPoints: 8, assignee: 'fpark', resolutionDate: new Date('2025-12-22') },
        // Jan
        { ticketId: 'PORTAL-104', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Dashboard home page layout', storyPoints: 8, assignee: 'cdavis', resolutionDate: new Date('2026-01-06') },
        { ticketId: 'PORTAL-105', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Invoice & billing section', storyPoints: 13, assignee: 'kobrien', resolutionDate: new Date('2026-01-10') },
        { ticketId: 'PORTAL-106', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Support ticket creation flow', storyPoints: 8, assignee: 'lnguyen', resolutionDate: new Date('2026-01-14') },
        { ticketId: 'PORTAL-107', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Notification center component', storyPoints: 5, assignee: 'mbell', resolutionDate: new Date('2026-01-17') },
        { ticketId: 'PORTAL-108', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Contract & agreement e-sign', storyPoints: 13, assignee: 'jliu', resolutionDate: new Date('2026-01-21') },
        { ticketId: 'PORTAL-109', epicKey: 'PORTAL', issueType: 'BUG', summary: 'Pagination on docs list broken', storyPoints: 2, assignee: 'bmartinez', resolutionDate: new Date('2026-01-24') },
        { ticketId: 'PORTAL-110', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Role-based access for teams', storyPoints: 8, assignee: 'npatel', resolutionDate: new Date('2026-01-27') },
        { ticketId: 'PORTAL-111', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Data export (CSV / JSON)', storyPoints: 5, assignee: 'fpark', resolutionDate: new Date('2026-01-30') },
        // Feb
        { ticketId: 'PORTAL-112', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Activity & audit log viewer', storyPoints: 8, assignee: 'cdavis', resolutionDate: new Date('2026-02-04') },
        { ticketId: 'PORTAL-113', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Multi-language support (i18n)', storyPoints: 13, assignee: 'gosei', resolutionDate: new Date('2026-02-08') },
        { ticketId: 'PORTAL-114', epicKey: 'PORTAL', issueType: 'BUG', summary: 'Session expiry UX issue', storyPoints: 2, assignee: 'jliu', resolutionDate: new Date('2026-02-12') },
        { ticketId: 'PORTAL-115', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Custom branding & white-label', storyPoints: 8, assignee: 'psharma', resolutionDate: new Date('2026-02-17') },
        { ticketId: 'PORTAL-116', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Onboarding wizard', storyPoints: 8, assignee: 'quinn@acme.io'.includes('@') ? 'qtorres' : 'qtorres', resolutionDate: new Date('2026-02-21') },
        { ticketId: 'PORTAL-117', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Integration marketplace listing', storyPoints: 5, assignee: 'kobrien', resolutionDate: new Date('2026-02-25') },
        // March — no Jade/Kevin
        { ticketId: 'PORTAL-118', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Advanced search & filter system', storyPoints: 8, assignee: 'achen', resolutionDate: new Date('2026-03-05') },
        { ticketId: 'PORTAL-119', epicKey: 'PORTAL', issueType: 'STORY', summary: 'API key management for developers', storyPoints: 8, assignee: 'rkim', resolutionDate: new Date('2026-03-10') },
        { ticketId: 'PORTAL-120', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Two-factor authentication', storyPoints: 5, assignee: 'sadeyemi', resolutionDate: new Date('2026-03-14') },
        { ticketId: 'PORTAL-121', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Accessibility audit (WCAG 2.1)', storyPoints: 8, assignee: 'tsvensson', resolutionDate: new Date('2026-03-18') },
        { ticketId: 'PORTAL-122', epicKey: 'PORTAL', issueType: 'BUG', summary: 'File upload fails over 10MB', storyPoints: 3, assignee: 'cdavis', resolutionDate: new Date('2026-03-22') },
        { ticketId: 'PORTAL-123', epicKey: 'PORTAL', issueType: 'STORY', summary: 'Push notifications integration', storyPoints: 5, assignee: 'ipetrov', resolutionDate: new Date('2026-03-27') },

        // ── MOBILE — DEV, capitalizable. ──────────────────────────────────────
        // Jan
        { ticketId: 'MOBILE-101', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Navigation architecture & routing', storyPoints: 8, assignee: 'ewilliams', resolutionDate: new Date('2026-01-07') },
        { ticketId: 'MOBILE-102', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Design system & component library', storyPoints: 13, assignee: 'psharma', resolutionDate: new Date('2026-01-13') },
        { ticketId: 'MOBILE-103', epicKey: 'MOBILE', issueType: 'STORY', summary: 'User onboarding screens', storyPoints: 8, assignee: 'odiallo', resolutionDate: new Date('2026-01-17') },
        { ticketId: 'MOBILE-104', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Product listing & detail pages', storyPoints: 8, assignee: 'ewilliams', resolutionDate: new Date('2026-01-22') },
        { ticketId: 'MOBILE-105', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Cart & checkout native flow', storyPoints: 13, assignee: 'hlima', resolutionDate: new Date('2026-01-29') },
        // Feb
        { ticketId: 'MOBILE-106', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Push notification service', storyPoints: 8, assignee: 'ewilliams', resolutionDate: new Date('2026-02-05') },
        { ticketId: 'MOBILE-107', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Deep link routing', storyPoints: 5, assignee: 'hlima', resolutionDate: new Date('2026-02-10') },
        { ticketId: 'MOBILE-108', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Offline mode & local cache', storyPoints: 8, assignee: 'fpark', resolutionDate: new Date('2026-02-16') },
        { ticketId: 'MOBILE-109', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Biometric authentication', storyPoints: 5, assignee: 'mbell', resolutionDate: new Date('2026-02-20') },
        { ticketId: 'MOBILE-110', epicKey: 'MOBILE', issueType: 'STORY', summary: 'App performance profiling', storyPoints: 5, assignee: 'ewilliams', resolutionDate: new Date('2026-02-25') },
        // March
        { ticketId: 'MOBILE-111', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Apple Pay & Google Pay', storyPoints: 13, assignee: 'rkim', resolutionDate: new Date('2026-03-06') },
        { ticketId: 'MOBILE-112', epicKey: 'MOBILE', issueType: 'STORY', summary: 'AR product preview (iOS)', storyPoints: 13, assignee: 'tsvensson', resolutionDate: new Date('2026-03-14') },
        { ticketId: 'MOBILE-113', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Order tracking map view', storyPoints: 8, assignee: 'hlima', resolutionDate: new Date('2026-03-20') },
        { ticketId: 'MOBILE-114', epicKey: 'MOBILE', issueType: 'STORY', summary: 'Loyalty points dashboard', storyPoints: 5, assignee: 'umensah', resolutionDate: new Date('2026-03-26') },

        // ── INFRA — NOT capitalizable. All expensed. ─────────────────────────
        // Jan
        { ticketId: 'INFRA-101', epicKey: 'INFRA', issueType: 'TASK', summary: 'Migrate CI to GitHub Actions', storyPoints: 5, assignee: 'gosei', resolutionDate: new Date('2026-01-09') },
        { ticketId: 'INFRA-102', epicKey: 'INFRA', issueType: 'TASK', summary: 'Kubernetes autoscaling config', storyPoints: 8, assignee: 'ipetrov', resolutionDate: new Date('2026-01-14') },
        { ticketId: 'INFRA-103', epicKey: 'INFRA', issueType: 'BUG', summary: 'Memory leak in API gateway', storyPoints: 5, assignee: 'bmartinez', resolutionDate: new Date('2026-01-19') },
        { ticketId: 'INFRA-104', epicKey: 'INFRA', issueType: 'TASK', summary: 'Datadog APM integration', storyPoints: 5, assignee: 'gosei', resolutionDate: new Date('2026-01-23') },
        { ticketId: 'INFRA-105', epicKey: 'INFRA', issueType: 'TASK', summary: 'Terraform modules for staging', storyPoints: 8, assignee: 'ipetrov', resolutionDate: new Date('2026-01-29') },
        // Feb
        { ticketId: 'INFRA-106', epicKey: 'INFRA', issueType: 'BUG', summary: 'Database connection pool exhaustion', storyPoints: 3, assignee: 'bmartinez', resolutionDate: new Date('2026-02-04') },
        { ticketId: 'INFRA-107', epicKey: 'INFRA', issueType: 'TASK', summary: 'Multi-region failover setup', storyPoints: 13, assignee: 'gosei', resolutionDate: new Date('2026-02-12') },
        { ticketId: 'INFRA-108', epicKey: 'INFRA', issueType: 'TASK', summary: 'Log aggregation pipeline (ELK)', storyPoints: 8, assignee: 'ipetrov', resolutionDate: new Date('2026-02-18') },
        { ticketId: 'INFRA-109', epicKey: 'INFRA', issueType: 'BUG', summary: 'CDN cache invalidation race', storyPoints: 3, assignee: 'ewilliams', resolutionDate: new Date('2026-02-22') },
        // March
        { ticketId: 'INFRA-110', epicKey: 'INFRA', issueType: 'TASK', summary: 'Security patch rollout (CVE-2026-x)', storyPoints: 5, assignee: 'sadeyemi', resolutionDate: new Date('2026-03-07') },
        { ticketId: 'INFRA-111', epicKey: 'INFRA', issueType: 'TASK', summary: 'Backup & DR test Q1', storyPoints: 5, assignee: 'gosei', resolutionDate: new Date('2026-03-12') },
        { ticketId: 'INFRA-112', epicKey: 'INFRA', issueType: 'BUG', summary: 'Flapping health checks on pods', storyPoints: 3, assignee: 'rkim', resolutionDate: new Date('2026-03-18') },

        // ── ANALYTICS — PLANNING, not capitalizable. All expense. ─────────────
        { ticketId: 'ANALYTICS-101', epicKey: 'ANALYTICS', issueType: 'TASK', summary: 'Requirements & stakeholder interviews', storyPoints: 5, assignee: 'laura@acme.io'.includes('@') ? 'lnguyen' : 'lnguyen', resolutionDate: new Date('2026-01-20') },
        { ticketId: 'ANALYTICS-102', epicKey: 'ANALYTICS', issueType: 'TASK', summary: 'Data source mapping & ERD', storyPoints: 5, assignee: 'npatel', resolutionDate: new Date('2026-01-28') },
        { ticketId: 'ANALYTICS-103', epicKey: 'ANALYTICS', issueType: 'TASK', summary: 'Tech stack evaluation (Superset vs Metabase)', storyPoints: 3, assignee: 'odiallo', resolutionDate: new Date('2026-02-06') },
        { ticketId: 'ANALYTICS-104', epicKey: 'ANALYTICS', issueType: 'TASK', summary: 'Architecture design doc', storyPoints: 5, assignee: 'lnguyen', resolutionDate: new Date('2026-02-14') },
        { ticketId: 'ANALYTICS-105', epicKey: 'ANALYTICS', issueType: 'TASK', summary: 'Prototype: revenue chart embed', storyPoints: 8, assignee: 'mbell', resolutionDate: new Date('2026-03-05') },
        { ticketId: 'ANALYTICS-106', epicKey: 'ANALYTICS', issueType: 'TASK', summary: 'Security & compliance review', storyPoints: 3, assignee: 'npatel', resolutionDate: new Date('2026-03-15') },
    ];

    let ticketCount = 0;
    for (const t of tickets) {
        if (!devIds[t.assignee]) {
            console.warn(`⚠ Skipping ticket ${t.ticketId} — unknown assignee: ${t.assignee}`);
            continue;
        }
        await prisma.jiraTicket.create({
            data: {
                ticketId: t.ticketId,
                epicKey: t.epicKey,
                issueType: t.issueType,
                summary: t.summary,
                storyPoints: t.storyPoints,
                resolutionDate: t.resolutionDate,
                assigneeId: devIds[t.assignee],
                projectId: projectIds[t.epicKey],
            },
        });
        ticketCount++;
    }
    console.log(`🎫 Tickets created: ${ticketCount}`);

    // ─────────────────────────────────────────────────────────────────────────
    // 7. ACCOUNTING PERIODS — Q1 2026 (plus Dec 2025)
    // ─────────────────────────────────────────────────────────────────────────
    // Monthly amort for NOVA: 387500/36 = $10,764/mo
    // Monthly amort for LEGACY: 215000/36 = $5,972/mo
    // Total monthly amort ≈ $16,736

    const periods = [
        {
            month: 12, year: 2025, status: 'CLOSED',
            totalCapitalized: 47200,   // Dec 2025 (historical)
            totalExpensed:    19800,
            totalAmortization: 16736,
        },
        {
            month: 1, year: 2026, status: 'CLOSED',
            totalCapitalized: 52400,   // Jan — heavy PORTAL + MOBILE activity
            totalExpensed:    23600,
            totalAmortization: 16736,
        },
        {
            month: 2, year: 2026, status: 'CLOSED',
            totalCapitalized: 56100,   // Feb — even heavier
            totalExpensed:    21900,
            totalAmortization: 16736,
        },
        {
            month: 3, year: 2026, status: 'OPEN',
            totalCapitalized: 0,
            totalExpensed:    0,
            totalAmortization: 0,
        },
    ];

    const periodIds: Record<string, string> = {};
    for (const p of periods) {
        const period = await prisma.accountingPeriod.create({ data: p });
        periodIds[`${p.month}-${p.year}`] = period.id;
    }
    console.log('📅 Accounting periods created: Dec 2025, Jan-Mar 2026');

    // ─────────────────────────────────────────────────────────────────────────
    // 8. JOURNAL ENTRIES — Dec 2025, Jan 2026, Feb 2026 (closed periods)
    // ─────────────────────────────────────────────────────────────────────────

    const journalEntries = [
        // Dec 2025
        { period: '12-2025', project: 'NOVA',   type: 'CAPITALIZATION', debit: '1720 - CIP Software', credit: '5100 - Eng Labor', amount: 28400, desc: 'Dec 2025 — Nova capitalizable stories' },
        { period: '12-2025', project: 'PORTAL', type: 'CAPITALIZATION', debit: '1720 - CIP Software', credit: '5100 - Eng Labor', amount: 18800, desc: 'Dec 2025 — Portal dev stories' },
        { period: '12-2025', project: 'NOVA',   type: 'AMORTIZATION',   debit: '5200 - Amortization Expense', credit: '1720 - Acc Amort', amount: 10764, desc: 'Dec 2025 — Nova monthly amort' },
        { period: '12-2025', project: 'LEGACY', type: 'AMORTIZATION',   debit: '5200 - Amortization Expense', credit: '1720 - Acc Amort', amount: 5972,  desc: 'Dec 2025 — Legacy monthly amort' },
        { period: '12-2025', project: 'INFRA',  type: 'EXPENSE',        debit: '6100 - R&D Expense', credit: '5100 - Eng Labor', amount: 19800, desc: 'Dec 2025 — Infra & bug costs expensed' },
        // Jan 2026
        { period: '1-2026',  project: 'NOVA',   type: 'CAPITALIZATION', debit: '1720 - CIP Software', credit: '5100 - Eng Labor', amount: 22100, desc: 'Jan 2026 — Nova stories capitalized' },
        { period: '1-2026',  project: 'PORTAL', type: 'CAPITALIZATION', debit: '1720 - CIP Software', credit: '5100 - Eng Labor', amount: 19800, desc: 'Jan 2026 — Portal stories capitalized' },
        { period: '1-2026',  project: 'MOBILE', type: 'CAPITALIZATION', debit: '1720 - CIP Software', credit: '5100 - Eng Labor', amount: 10500, desc: 'Jan 2026 — Mobile app stories capitalized' },
        { period: '1-2026',  project: 'NOVA',   type: 'AMORTIZATION',   debit: '5200 - Amortization Expense', credit: '1720 - Acc Amort', amount: 10764, desc: 'Jan 2026 — Nova monthly amort' },
        { period: '1-2026',  project: 'LEGACY', type: 'AMORTIZATION',   debit: '5200 - Amortization Expense', credit: '1720 - Acc Amort', amount: 5972,  desc: 'Jan 2026 — Legacy monthly amort' },
        { period: '1-2026',  project: 'INFRA',  type: 'EXPENSE',        debit: '6100 - R&D Expense', credit: '5100 - Eng Labor', amount: 14300, desc: 'Jan 2026 — Infra tasks expensed' },
        { period: '1-2026',  project: 'ANALYTICS', type: 'EXPENSE',     debit: '6100 - R&D Expense', credit: '5100 - Eng Labor', amount: 9300,  desc: 'Jan 2026 — Analytics planning expensed' },
        // Feb 2026
        { period: '2-2026',  project: 'NOVA',   type: 'CAPITALIZATION', debit: '1720 - CIP Software', credit: '5100 - Eng Labor', amount: 26300, desc: 'Feb 2026 — Nova stories capitalized' },
        { period: '2-2026',  project: 'PORTAL', type: 'CAPITALIZATION', debit: '1720 - CIP Software', credit: '5100 - Eng Labor', amount: 20100, desc: 'Feb 2026 — Portal stories capitalized' },
        { period: '2-2026',  project: 'MOBILE', type: 'CAPITALIZATION', debit: '1720 - CIP Software', credit: '5100 - Eng Labor', amount: 9700,  desc: 'Feb 2026 — Mobile stories capitalized' },
        { period: '2-2026',  project: 'NOVA',   type: 'AMORTIZATION',   debit: '5200 - Amortization Expense', credit: '1720 - Acc Amort', amount: 10764, desc: 'Feb 2026 — Nova monthly amort' },
        { period: '2-2026',  project: 'LEGACY', type: 'AMORTIZATION',   debit: '5200 - Amortization Expense', credit: '1720 - Acc Amort', amount: 5972,  desc: 'Feb 2026 — Legacy monthly amort' },
        { period: '2-2026',  project: 'INFRA',  type: 'EXPENSE',        debit: '6100 - R&D Expense', credit: '5100 - Eng Labor', amount: 15600, desc: 'Feb 2026 — Infra tasks expensed' },
        { period: '2-2026',  project: 'ANALYTICS', type: 'EXPENSE',     debit: '6100 - R&D Expense', credit: '5100 - Eng Labor', amount: 6300,  desc: 'Feb 2026 — Analytics planning expensed' },
    ];

    for (const je of journalEntries) {
        await prisma.journalEntry.create({
            data: {
                entryType:     je.type as 'CAPITALIZATION' | 'AMORTIZATION' | 'EXPENSE',
                debitAccount:  je.debit,
                creditAccount: je.credit,
                amount:        je.amount,
                description:   je.desc,
                periodId:      periodIds[je.period],
                projectId:     projectIds[je.project],
            },
        });
    }
    console.log('📒 Journal entries created:', journalEntries.length);

    console.log('');
    console.log('✅ Q1 2026 seed complete!');
    console.log('   👥 20 developers (16 Jan/Feb, 2 left Mar, 4 new in Mar)');
    console.log('   💰 3 payroll imports: Jan, Feb, March');
    console.log('   📁 6 projects: NOVA (live), PORTAL (dev), MOBILE (dev), INFRA (exp), LEGACY (retired), ANALYTICS (planning)');
    console.log(`   🎫 ${ticketCount} Jira tickets across all projects`);
    console.log('   📅 4 accounting periods: Dec 2025 (closed), Jan-Feb 2026 (closed), Mar 2026 (open)');
    console.log('   📒 Journal entries for Dec, Jan, Feb');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
