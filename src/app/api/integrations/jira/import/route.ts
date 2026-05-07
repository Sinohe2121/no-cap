export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { JiraImportSchema, formatZodError } from '@/lib/validations';
import { persistTicketCosts } from '@/lib/ticketCostPersist';
import { normalizeIssueType } from '@/lib/jiraUtils';
import { invalidatePeriodCostsCache } from '@/lib/calculationsCache';
import { parsePeriodLabel } from '@/lib/periodTickets';

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

        // ── Step 4: Insert new tickets in bulk; refresh existing ones in place ──
        // importPeriod = FIRST-SEEN (earliest period the ticket has appeared
        // in any of our imports). It moves backward but never forward:
        //   • on insert: set to the period being imported
        //   • on re-encounter, current >= existing: leave alone
        //     (the ticket has already been seen earlier; re-encounters refresh
        //     resolutionDate / summary / story points / assignee / etc.)
        //   • on re-encounter, current < existing: move backward to current
        //     (we're back-filling an earlier period and discovering the ticket
        //     existed before what we previously thought was first-seen)
        // The "active in period N" derivation (importPeriod ≤ N AND not
        // resolved before N starts) keeps the ticket in scope for every
        // period until it actually closes.
        const existingTickets = await prisma.jiraTicket.findMany({
            where: { ticketId: { in: dataToInsert.map((t) => t.ticketId) } },
            select: { ticketId: true, importPeriod: true },
        });
        const existingByTicketId = new Map(existingTickets.map((t) => [t.ticketId, t.importPeriod] as const));
        const newTickets = dataToInsert.filter((t) => !existingByTicketId.has(t.ticketId));
        const updateTargets = dataToInsert.filter((t) => existingByTicketId.has(t.ticketId));

        // Compute the chronological key of the period being imported (if any).
        // Used to decide whether a re-encounter should move importPeriod
        // backward. parsePeriodLabel returns null on malformed input, in which
        // case we fall back to "leave existing importPeriod alone" semantics.
        const labelKeyOf = (label: string | null): number | null => {
            if (!label) return null;
            const p = parsePeriodLabel(label);
            return p ? p.year * 12 + (p.month - 1) : null;
        };
        const currentKey = labelKeyOf(importPeriod ?? null);

        let importedCount = 0;
        if (newTickets.length > 0) {
            const created = await prisma.jiraTicket.createMany({
                data: newTickets,
                skipDuplicates: true,
            });
            importedCount = created.count;
        }

        const BATCH_SIZE = 50;
        for (let i = 0; i < updateTargets.length; i += BATCH_SIZE) {
            const batch = updateTargets.slice(i, i + BATCH_SIZE);
            await prisma.$transaction(
                batch.map((ticket) => {
                    const existingImportPeriod = existingByTicketId.get(ticket.ticketId) ?? null;
                    const existingKey = labelKeyOf(existingImportPeriod);
                    // Move importPeriod backward iff we have both keys and
                    // the period being imported now is earlier than the
                    // existing first-seen period.
                    const shouldMoveBackward =
                        currentKey !== null &&
                        existingKey !== null &&
                        currentKey < existingKey;
                    return prisma.jiraTicket.update({
                        where: { ticketId: ticket.ticketId },
                        data: {
                            epicKey: ticket.epicKey,
                            issueType: ticket.issueType,
                            summary: ticket.summary,
                            storyPoints: ticket.storyPoints,
                            resolutionDate: ticket.resolutionDate,
                            assigneeId: ticket.assigneeId,
                            projectId: ticket.projectId,
                            customFields: ticket.customFields,
                            ...(shouldMoveBackward ? { importPeriod: ticket.importPeriod } : {}),
                        },
                    });
                })
            );
        }
        const updatedCount = updateTargets.length;

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

        // Ticket data drives cost results — clear the cache so the next read
        // picks up the freshly imported tickets across any open period.
        invalidatePeriodCostsCache();

        return NextResponse.json({
            message: 'Import successful',
            importedCount,
            updatedCount,
            projectsCreated: createdProjects.length,
            projectsCreatedNames: createdProjects.map(p => p.epicKey),
            costsUpdated,
        });

    } catch (error) {
        console.error('Jira import error:', error);
        return NextResponse.json({ error: 'Failed to import tickets' }, { status: 500 });
    }
}
