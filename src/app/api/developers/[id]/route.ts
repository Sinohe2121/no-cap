export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PatchDeveloperSchema, formatZodError } from '@/lib/validations';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const [developer, bugSpConfig, otherSpConfig] = await Promise.all([
            prisma.developer.findUnique({
                where: { id: params.id },
                include: {
                    tickets: {
                        include: { project: { select: { id: true, name: true, epicKey: true, status: true, isCapitalizable: true } } },
                        orderBy: { resolutionDate: 'desc' },
                    },
                    payrollEntries: {
                        include: { payrollImport: { select: { payDate: true, fringeBenefitRate: true } } },
                    },
                },
            }),
            prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
            prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
        ]);

        if (!developer) {
            return NextResponse.json({ error: 'Developer not found' }, { status: 404 });
        }

        const bugSpFallback = parseFloat(bugSpConfig?.value ?? '1') || 1;
        const otherSpFallback = parseFloat(otherSpConfig?.value ?? '1') || 1;

        /** Applied SP mirrors the journal entry logic: use raw SP if > 0, else the type-specific fallback */
        const appliedSP = (t: (typeof developer.tickets)[0]): number => {
            if (t.storyPoints > 0) return t.storyPoints;
            if (t.issueType === 'BUG') return bugSpFallback;
            return otherSpFallback;
        };

        // Compute loaded cost from actual payroll register data
        const totalSalary = developer.payrollEntries.reduce((s, pe) => s + pe.grossSalary, 0);
        const totalFringe = developer.payrollEntries.reduce((s, pe) => s + (pe.grossSalary * (pe.payrollImport.fringeBenefitRate ?? 0)), 0);
        const totalSbc = developer.payrollEntries.reduce((s, pe) => s + (pe.sbcAmount || 0), 0);
        const loadedCost = totalSalary + totalFringe + totalSbc;

        // All point totals use Applied SP to match journal entry math
        const totalPoints = developer.tickets.reduce((s, t) => s + appliedSP(t), 0);
        const storyPoints = developer.tickets.filter(t => t.issueType === 'STORY').reduce((s, t) => s + appliedSP(t), 0);
        const bugPoints   = developer.tickets.filter(t => t.issueType === 'BUG').reduce((s, t) => s + appliedSP(t), 0);
        const taskPoints  = developer.tickets.filter(t => !['STORY', 'BUG'].includes(t.issueType)).reduce((s, t) => s + appliedSP(t), 0);
        const capPoints   = developer.tickets
            .filter(t => t.project && t.issueType === 'STORY' && t.project.isCapitalizable)
            .reduce((s, t) => s + appliedSP(t), 0);

        // Attach appliedSP to every ticket so the UI can show both columns
        const tickets = developer.tickets.map(t => ({
            ...t,
            appliedSP: appliedSP(t),
        }));

        return NextResponse.json({
            ...developer,
            tickets,
            payrollEntries: undefined, // don't leak raw entries to client
            loadedCost,
            totalSalary,
            totalFringe,
            totalSbc,
            totalPoints,
            storyPoints,
            bugPoints,
            taskPoints,
            capPoints,
            capRatio: totalPoints > 0 ? capPoints / totalPoints : 0,
        });
    } catch (error) {
        console.error('Developer detail error:', error);
        return NextResponse.json({ error: 'Failed to load developer' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = PatchDeveloperSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { name, email, jiraUserId, role, monthlySalary, stockCompAllocation, fringeBenefitRate, isActive } = parsed.data;

        const updated = await prisma.developer.update({
            where: { id: params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(email !== undefined && { email }),
                ...(jiraUserId !== undefined && { jiraUserId }),
                ...(role !== undefined && { role }),
                ...(monthlySalary !== undefined && { monthlySalary }),
                ...(stockCompAllocation !== undefined && { stockCompAllocation }),
                ...(fringeBenefitRate !== undefined && { fringeBenefitRate }),
                ...(isActive !== undefined && { isActive }),
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Developer update error:', error);
        return NextResponse.json({ error: 'Failed to update developer' }, { status: 500 });
    }
}
