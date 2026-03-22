export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CreateControlSchema, UpdateControlSchema, formatZodError } from '@/lib/validations';

// Default SOC 2 control library — seeded if empty
const DEFAULT_CONTROLS = [
    // CC6 — Logical Access
    { criterion: 'CC6', controlId: 'CC6.1', title: 'Access Control Policy', description: 'A formal access control policy exists, is approved, and communicated to all relevant personnel.', frequency: 'ANNUAL' },
    { criterion: 'CC6', controlId: 'CC6.2', title: 'Unique User IDs', description: 'All users are assigned unique IDs for system access. Shared accounts are prohibited.', frequency: 'CONTINUOUS' },
    { criterion: 'CC6', controlId: 'CC6.3', title: 'Role-Based Access Review', description: 'User access rights are reviewed quarterly to ensure least-privilege and remove stale accounts.', frequency: 'QUARTERLY' },
    { criterion: 'CC6', controlId: 'CC6.4', title: 'MFA Enforcement', description: 'Multi-factor authentication is required for all administrative and production access.', frequency: 'CONTINUOUS' },
    { criterion: 'CC6', controlId: 'CC6.5', title: 'Offboarding Procedure', description: 'Terminated employee access is revoked within 24 hours of departure.', frequency: 'CONTINUOUS' },
    // CC7 — Change Management
    { criterion: 'CC7', controlId: 'CC7.1', title: 'Change Management Policy', description: 'A change management policy documents approval requirements and rollback procedures.', frequency: 'ANNUAL' },
    { criterion: 'CC7', controlId: 'CC7.2', title: 'Code Review Requirement', description: 'All production code changes require at least one peer code review before merging.', frequency: 'CONTINUOUS' },
    { criterion: 'CC7', controlId: 'CC7.3', title: 'Deployment Pipeline Controls', description: 'Automated CI/CD pipelines enforce testing and prevent direct manual deploys to production.', frequency: 'CONTINUOUS' },
    { criterion: 'CC7', controlId: 'CC7.4', title: 'Vulnerability Scanning', description: 'Dependencies and container images are scanned for known vulnerabilities on every build.', frequency: 'CONTINUOUS' },
    { criterion: 'CC7', controlId: 'CC7.5', title: 'Change Log Maintenance', description: 'A log of production changes is maintained with author, date, and purpose.', frequency: 'MONTHLY' },
    // CC2 — Communication & Information
    { criterion: 'CC2', controlId: 'CC2.1', title: 'Security Awareness Training', description: 'All employees complete security awareness training annually and upon onboarding.', frequency: 'ANNUAL' },
    { criterion: 'CC2', controlId: 'CC2.2', title: 'Incident Response Policy', description: 'An incident response plan is documented, tested, and communicated to the security team.', frequency: 'ANNUAL' },
    { criterion: 'CC2', controlId: 'CC2.3', title: 'Data Classification Policy', description: 'A data classification policy categorizes data by sensitivity and defines handling requirements.', frequency: 'ANNUAL' },
    { criterion: 'CC2', controlId: 'CC2.4', title: 'Vendor Risk Review', description: 'Third-party vendors with access to sensitive data are reviewed for security posture annually.', frequency: 'ANNUAL' },
    // A1 — Availability
    { criterion: 'A1', controlId: 'A1.1', title: 'Uptime Monitoring', description: 'Production systems are monitored 24/7 with automated alerting for availability degradation.', frequency: 'CONTINUOUS' },
    { criterion: 'A1', controlId: 'A1.2', title: 'Backup and Recovery', description: 'Data backups are taken daily, stored off-site, and recovery tested quarterly.', frequency: 'QUARTERLY' },
    { criterion: 'A1', controlId: 'A1.3', title: 'Disaster Recovery Plan', description: 'A DR plan defines RTOs/RPOs and is tested at least annually.', frequency: 'ANNUAL' },
    { criterion: 'A1', controlId: 'A1.4', title: 'Capacity Planning', description: 'Infrastructure capacity is reviewed quarterly to ensure scalability targets are met.', frequency: 'QUARTERLY' },
    // CC3 — Risk Assessment
    { criterion: 'CC3', controlId: 'CC3.1', title: 'Formal Risk Assessment', description: 'A formal risk assessment is performed annually to identify and evaluate threats to systems.', frequency: 'ANNUAL' },
    { criterion: 'CC3', controlId: 'CC3.2', title: 'Risk Register Maintenance', description: 'A risk register is maintained, reviewed quarterly, and communicated to leadership.', frequency: 'QUARTERLY' },
    { criterion: 'CC3', controlId: 'CC3.3', title: 'Penetration Testing', description: 'External penetration tests are conducted annually by a qualified third party.', frequency: 'ANNUAL' },
];

export async function GET() {
    try {
        const count = await prisma.soc2Control.count();
        if (count === 0) {
            // Seed on first access — skipDuplicates handles concurrent-request race
            await prisma.soc2Control.createMany({ data: DEFAULT_CONTROLS, skipDuplicates: true });
        }

        const controls = await prisma.soc2Control.findMany({
            orderBy: [{ criterion: 'asc' }, { controlId: 'asc' }],
            include: {
                evidence: { orderBy: { createdAt: 'desc' } },
            },
        });

        // Compute readiness score per control and overall
        const scored = controls.map((c) => {
            const verified = c.evidence.filter((e) => e.isVerified).length;
            const total = c.evidence.length;
            let score = 0;
            if (c.status === 'COMPLIANT') score = 100;
            else if (c.status === 'IN_PROGRESS') score = 50;
            else if (c.status === 'AT_RISK') score = 25;
            else if (verified > 0) score = Math.min(75, (verified / Math.max(total, 1)) * 100);
            return { ...c, evidenceCount: total, verifiedCount: verified, score };
        });

        const overallScore = scored.length > 0
            ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length)
            : 0;

        const byCriterion = ['CC6', 'CC7', 'CC2', 'A1', 'CC3'].map((criterion) => {
            const ctrls = scored.filter((c) => c.criterion === criterion);
            const avg = ctrls.length > 0
                ? Math.round(ctrls.reduce((s, c) => s + c.score, 0) / ctrls.length)
                : 0;
            const compliant = ctrls.filter((c) => c.status === 'COMPLIANT').length;
            return { criterion, score: avg, total: ctrls.length, compliant };
        });

        return NextResponse.json({ controls: scored, overallScore, byCriterion });
    } catch (e) {
        console.error('SOC2 controls GET error:', e);
        return NextResponse.json({ error: 'Failed to load controls' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = CreateControlSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { criterion, controlId, title, description, frequency } = parsed.data;
        const control = await prisma.soc2Control.create({
            data: { criterion, controlId, title, description: description || '', frequency: frequency || 'ANNUAL' },
        });
        return NextResponse.json(control, { status: 201 });
    } catch (e) {
        console.error('SOC2 control create error:', e);
        return NextResponse.json({ error: 'Failed to create control' }, { status: 400 });
    }
}

export async function PATCH(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = UpdateControlSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { id, criterion, controlId, title, description, frequency, status } = parsed.data;
        const data: Record<string, unknown> = {};
        if (criterion !== undefined) data.criterion = criterion;
        if (controlId !== undefined) data.controlId = controlId;
        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (frequency !== undefined) data.frequency = frequency;
        if (status !== undefined) data.status = status;

        const updated = await prisma.soc2Control.update({ where: { id }, data });
        return NextResponse.json(updated);
    } catch (e) {
        console.error('SOC2 control update error:', e);
        return NextResponse.json({ error: 'Failed to update control' }, { status: 400 });
    }
}
