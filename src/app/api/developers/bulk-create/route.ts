import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { BulkCreateDevelopersSchema, formatZodError } from '@/lib/validations';

export async function POST(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = BulkCreateDevelopersSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { developers } = parsed.data;

        let created = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const dev of developers) {
            const email = (dev.email || '').trim().toLowerCase();
            const name = (dev.name || '').trim();
            if (!email || !name) {
                errors.push(`Missing name or email: ${JSON.stringify(dev)}`);
                skipped++;
                continue;
            }

            // Check if already exists
            const existing = await prisma.developer.findUnique({ where: { email } });
            if (existing) {
                skipped++;
                continue;
            }

            // Use email prefix as jiraUserId placeholder (ensure uniqueness)
            const jiraUserId = email.split('@')[0] + '_' + Date.now().toString(36) + created;

            await prisma.developer.create({
                data: {
                    name,
                    email,
                    jiraUserId,
                    role: dev.role || 'ENG',
                    monthlySalary: 0,
                    fringeBenefitRate: 0.25,
                    stockCompAllocation: 0,
                    isActive: true,
                },
            });
            created++;
        }

        return NextResponse.json({ created, skipped, errors });
    } catch (error) {
        console.error('Bulk create developers error:', error);
        return NextResponse.json({ error: 'Failed to create developers' }, { status: 500 });
    }
}
