import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { JiraImportSchema, formatZodError } from '@/lib/validations';

export async function POST(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = JiraImportSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { tickets, importPeriod } = parsed.data;

        // Prepare records for createMany
        const dataToInsert = tickets
            .filter((t: any) => t.importable !== false)
            .map((t: any) => {
            // Fall back to extracting story points from customFields
            let sp = t.storyPoints || 0;
            if (sp === 0 && t.customFields) {
                const cfSp = t.customFields['Story Points'] || t.customFields['story_points'] || t.customFields['Story points'];
                if (cfSp) sp = parseFloat(cfSp) || 0;
            }
            return {
                ticketId: t.ticketId,
                epicKey: t.epicKey,
                issueType: t.issueType,
                summary: t.summary,
                storyPoints: sp,
                resolutionDate: t.resolutionDate ? new Date(t.resolutionDate) : null,
                assigneeId: t.assigneeId || null,
                projectId: t.projectId || null,
                customFields: t.customFields,
                importPeriod: importPeriod || null,
            };
        });

        if (dataToInsert.length === 0) {
            return NextResponse.json({ message: 'No tickets to import' });
        }

        // Insert using createMany (skip duplicates based on unique ticketId)
        const result = await prisma.jiraTicket.createMany({
            data: dataToInsert,
            skipDuplicates: true,
        });

        return NextResponse.json({ message: 'Import successful', importedCount: result.count });
    } catch (error) {
        console.error('Jira import error:', error);
        return NextResponse.json({ error: 'Failed to import tickets' }, { status: 500 });
    }
}
