import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';
import { ClassificationRulesArraySchema, formatZodError } from '@/lib/validations';

export interface CapRule {
    priority: number;
    issueType: string; // STORY | BUG | TASK | ANY
    projectStatus: string; // PLANNING | DEV | LIVE | RETIRED | ANY
    projectCapitalizable: boolean | null; // true | false | null (any)
    action: string; // CAPITALIZE | EXPENSE
}

const DEFAULT_RULES: CapRule[] = [
    { priority: 1, issueType: 'BUG', projectStatus: 'ANY', projectCapitalizable: null, action: 'EXPENSE' },
    { priority: 2, issueType: 'STORY', projectStatus: 'DEV', projectCapitalizable: true, action: 'CAPITALIZE' },
    { priority: 3, issueType: 'ANY', projectStatus: 'ANY', projectCapitalizable: null, action: 'EXPENSE' },
];

export async function GET() {
    try {
        const config = await prisma.globalConfig.findUnique({
            where: { key: 'classification_rules' },
        });

        if (config) {
            return NextResponse.json(JSON.parse(config.value));
        }

        // Seed defaults if not present
        await prisma.globalConfig.create({
            data: {
                key: 'classification_rules',
                value: JSON.stringify(DEFAULT_RULES),
                label: 'Capitalization Classification Rules',
            },
        });

        return NextResponse.json(DEFAULT_RULES);
    } catch (error) {
        console.error('Rules GET error:', error);
        return NextResponse.json({ error: 'Failed to load rules' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = ClassificationRulesArraySchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const rules = parsed.data;

        await prisma.globalConfig.upsert({
            where: { key: 'classification_rules' },
            update: { value: JSON.stringify(rules) },
            create: {
                key: 'classification_rules',
                value: JSON.stringify(rules),
                label: 'Capitalization Classification Rules',
            },
        });

        return NextResponse.json(rules);
    } catch (error) {
        return handleApiError(error, 'Failed to save rules');
    }
}

export async function DELETE() {
    // Reset to defaults
    try {
        await prisma.globalConfig.upsert({
            where: { key: 'classification_rules' },
            update: { value: JSON.stringify(DEFAULT_RULES) },
            create: {
                key: 'classification_rules',
                value: JSON.stringify(DEFAULT_RULES),
                label: 'Capitalization Classification Rules',
            },
        });
        return NextResponse.json(DEFAULT_RULES);
    } catch (error) {
        console.error('Rules DELETE error:', error);
        return NextResponse.json({ error: 'Failed to reset rules' }, { status: 500 });
    }
}
