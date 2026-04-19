export const dynamic = "force-dynamic";
import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { UpdateDeveloperSchema, CreateDeveloperSchema, formatZodError } from '@/lib/validations';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');

        // Fix #11 — validate date params before constructing Date objects
        const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

        let ticketFilter = {};
        let monthsInPeriod = 1;
        
        if (startParam && endParam) {
            if (!ISO_DATE_RE.test(startParam) || !ISO_DATE_RE.test(endParam)) {
                return NextResponse.json({ error: 'start and end must be ISO dates (YYYY-MM-DD)' }, { status: 400 });
            }
            const start = new Date(startParam + 'T00:00:00');
            const end   = new Date(endParam   + 'T23:59:59');
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return NextResponse.json({ error: 'Invalid date value' }, { status: 400 });
            }
            if (start > end) {
                return NextResponse.json({ error: 'start must be before end' }, { status: 400 });
            }
            ticketFilter = { resolutionDate: { gte: start, lte: end } };
            
            monthsInPeriod = Math.max(0,
                (end.getFullYear() - start.getFullYear()) * 12
                + end.getMonth() - start.getMonth() + 1
            );
        }


        const developers = await prisma.developer.findMany({
            include: {
                tickets: {
                    where: ticketFilter,
                    select: { storyPoints: true, issueType: true, project: { select: { isCapitalizable: true, status: true } } },
                },
                payrollEntries: {
                    include: { payrollImport: { select: { payDate: true, fringeBenefitRate: true } } },
                },
            },
            orderBy: { name: 'asc' },
        });

        // Fix #27 — check role; only admins receive salary/compensation fields
        const auth = await requireAuth(request);
        if (auth instanceof NextResponse) return auth;
        const isAdmin = auth.role === 'ADMIN';

        // Build date range for payroll filtering
        let payrollStart: Date | null = null;
        let payrollEnd: Date | null = null;
        if (startParam && endParam) {
            payrollStart = new Date(startParam + 'T00:00:00');
            payrollEnd = new Date(endParam + 'T23:59:59');
        }

        const devsWithStats = developers.map((dev) => {
            // Filter payroll entries by selected period
            const relevantEntries = dev.payrollEntries.filter((pe) => {
                if (!payrollStart || !payrollEnd) return true; // all time
                const pd = new Date(pe.payrollImport.payDate);
                return pd >= payrollStart && pd <= payrollEnd;
            });

            // Fallback: if no payroll for the selected period, use the most recent available entry
            // This ensures loaded cost is shown even when viewing a period without payroll (e.g. current month)
            const effectiveEntries = relevantEntries.length > 0
                ? relevantEntries
                : [...dev.payrollEntries].sort(
                    (a, b) => new Date(b.payrollImport.payDate).getTime() - new Date(a.payrollImport.payDate).getTime()
                  ).slice(0, 1);

            // Sum actual payroll data
            const totalSalary = effectiveEntries.reduce((s, pe) => s + pe.grossSalary, 0);
            const totalFringe = effectiveEntries.reduce((s, pe) => s + (pe.grossSalary * (pe.payrollImport.fringeBenefitRate ?? 0)), 0);
            const totalSbc = effectiveEntries.reduce((s, pe) => s + (pe.sbcAmount || 0), 0);
            const totalLoadedCost = totalSalary + totalFringe + totalSbc;

            // For "monthly salary" column: average across periods, or total if single month
            const periodCount = relevantEntries.length > 0
                ? new Set(relevantEntries.map(pe => pe.payrollImportId)).size
                : 1;
            const avgMonthlySalary = periodCount > 0 ? totalSalary / periodCount : 0;

            const totalPoints = dev.tickets.reduce((s, t) => s + t.storyPoints, 0);
            const capPoints = dev.tickets
                .filter((t) => t.project && t.issueType === 'STORY' && t.project.isCapitalizable)
                .reduce((s, t) => s + t.storyPoints, 0);
            const capRatio = totalPoints > 0 ? capPoints / totalPoints : 0;

            // Public fields — safe for all authenticated users
            const base = {
                id: dev.id,
                name: dev.name,
                email: dev.email,
                jiraUserId: dev.jiraUserId,
                role: dev.role,
                isActive: dev.isActive,
                totalPoints,
                capPoints,
                expPoints: totalPoints - capPoints,
                capRatio,
                ticketCount: dev.tickets.length,
            };

            // Admin-only fields — compensation details
            if (isAdmin) {
                return {
                    ...base,
                    monthlySalary: avgMonthlySalary,
                    fringeBenefitRate: dev.fringeBenefitRate,
                    stockCompAllocation: totalSbc,
                    loadedCost: totalLoadedCost,
                    periodCost: totalLoadedCost,
                };
            }

            return base;
        });

        return NextResponse.json(devsWithStats);
    } catch (error) {
        console.error('Developers API error:', error);
        return NextResponse.json({ error: 'Failed to load developers' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const raw = await request.json();
        const parsed = UpdateDeveloperSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { id, monthlySalary, stockCompAllocation, fringeBenefitRate, isActive } = parsed.data;

        const updated = await prisma.developer.update({
            where: { id },
            data: {
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

export async function POST(request: Request) {
    try {
        const raw = await request.json();
        const parsed = CreateDeveloperSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { name, email, jiraUserId, role, monthlySalary, fringeBenefitRate, stockCompAllocation } = parsed.data;

        const developer = await prisma.developer.create({
            data: {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                jiraUserId: (jiraUserId || '').trim(),
                role,
                monthlySalary: Number(monthlySalary) || 0,
                fringeBenefitRate: Number(fringeBenefitRate) || 0.25,
                stockCompAllocation: Number(stockCompAllocation) || 0,
                isActive: true,
            },
        });

        return NextResponse.json(developer, { status: 201 });
    } catch (error) {
        console.error('Developer create error:', error);
        return NextResponse.json({ error: 'Failed to create developer' }, { status: 500 });
    }
}
