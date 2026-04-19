export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { JiraImportSchema, formatZodError } from '@/lib/validations';
import { persistTicketCosts } from '@/lib/ticketCostPersist';
import { normalizeIssueType } from '@/lib/jiraUtils';

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

        // ── Step 1: Auto-create missing projects from epicKey/projectName ────────
        // Collect unique epicKey → projectName for tickets that have no projectId
        const missingProjectKeys = new Map<string, string>(); // epicKey -> projectName
        for (const t of tickets) {
            if (!t.projectId && t.epicKey) {
                const key = t.epicKey.toUpperCase();
                if (!missingProjectKeys.has(key)) {
                    missingProjectKeys.set(key, t.projectName || key);
                }
            }
        }

        // Find which of those epicKeys already exist so we don't double-create
        const epicKeyList = Array.from(missingProjectKeys.keys());
        const existingProjects = epicKeyList.length > 0
            ? await prisma.project.findMany({
                where: { epicKey: { in: epicKeyList, mode: 'insensitive' } },
                select: { id: true, epicKey: true },
            })
            : [];
        const existingEpicKeys = new Set(existingProjects.map(p => p.epicKey.toUpperCase()));

        // Create the truly missing projects
        const createdProjects: { id: string; epicKey: string }[] = [];
        for (const [epicKey, projectName] of Array.from(missingProjectKeys.entries())) {
            if (!existingEpicKeys.has(epicKey)) {
                const proj = await prisma.project.create({
                    data: {
                        name: projectName,
                        epicKey: epicKey,
                        status: 'PLANNING',
                        isCapitalizable: true,
                        amortizationMonths: 36,
                    },
                    select: { id: true, epicKey: true },
                });
                createdProjects.push(proj);
            }
        }

        // ── Step 2: Build full epicKey → projectId map (existing + newly created) ─
        const allRelevantProjects = [...existingProjects, ...createdProjects];
        const epicToProjectId = new Map<string, string>(
            allRelevantProjects.map(p => [p.epicKey.toUpperCase(), p.id])
        );

        // ── Step 3: Prepare ticket records with resolved projectIds ───────────────
        const dataToInsert = tickets
            .filter((t: any) => t.importable !== false)
            .map((t: any) => {
                // Fall back to extracting story points from customFields
                let sp = t.storyPoints || 0;
                if (sp === 0 && t.customFields) {
                    const cfSp = t.customFields['Story Points'] || t.customFields['story_points'] || t.customFields['Story points'];
                    if (cfSp) sp = parseFloat(cfSp) || 0;
                }

                // Use auto-created projectId if ticket had none
                const resolvedProjectId = t.projectId
                    || (t.epicKey ? epicToProjectId.get(t.epicKey.toUpperCase()) : null)
                    || null;

                return {
                    ticketId: t.ticketId,
                    epicKey: t.epicKey,
                    issueType: normalizeIssueType(t.issueType || 'TASK'),
                    summary: t.summary,
                    storyPoints: sp,
                    resolutionDate: t.resolutionDate ? new Date(t.resolutionDate) : null,
                    assigneeId: t.assigneeId || null,
                    projectId: resolvedProjectId,
                    customFields: t.customFields,
                    importPeriod: importPeriod || null,
                };
            });

        if (dataToInsert.length === 0) {
            return NextResponse.json({ message: 'No tickets to import' });
        }

        // ── Step 4: Insert tickets (skip duplicates on unique ticketId) ───────────
        const result = await prisma.jiraTicket.createMany({
            data: dataToInsert,
            skipDuplicates: true,
        });

        // ── Step 5: Retroactively link any orphaned tickets (projectId=null) ─────
        // This handles tickets that were previously imported without a project mapping
        const allProjects = await prisma.project.findMany({ select: { id: true, epicKey: true } });
        for (const proj of allProjects) {
            await prisma.jiraTicket.updateMany({
                where: { projectId: null, epicKey: { equals: proj.epicKey, mode: 'insensitive' } },
                data: { projectId: proj.id },
            });
        }

        // ── Step 6: Persist per-ticket cost allocations using Applied SP ──────────
        // This distributes each developer's net loaded cost across their tickets
        // proportionally by Applied SP (uses BUG/OTHER fallbacks for 0-SP tickets)
        let costsUpdated = 0;
        if (importPeriod) {
            const persistResult = await persistTicketCosts(importPeriod);
            costsUpdated = persistResult.updated;
        }

        return NextResponse.json({
            message: 'Import successful',
            importedCount: result.count,
            projectsCreated: createdProjects.length,
            projectsCreatedNames: createdProjects.map(p => p.epicKey),
            costsUpdated,
        });

    } catch (error) {
        console.error('Jira import error:', error);
        return NextResponse.json({ error: 'Failed to import tickets' }, { status: 500 });
    }
}

