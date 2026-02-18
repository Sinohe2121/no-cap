import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const projects = await prisma.project.findMany({
            include: {
                _count: { select: { tickets: true, journalEntries: true } },
                tickets: {
                    select: { storyPoints: true, issueType: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const projectsWithStats = projects.map((p) => {
            const totalCost = p.accumulatedCost + p.startingBalance;
            const storyPoints = p.tickets.filter((t) => t.issueType === 'STORY').reduce((s, t) => s + t.storyPoints, 0);
            const bugPoints = p.tickets.filter((t) => t.issueType === 'BUG').reduce((s, t) => s + t.storyPoints, 0);
            return {
                id: p.id,
                name: p.name,
                description: p.description,
                epicKey: p.epicKey,
                status: p.status,
                isCapitalizable: p.isCapitalizable,
                amortizationMonths: p.amortizationMonths,
                totalCost,
                accumulatedCost: p.accumulatedCost,
                startingBalance: p.startingBalance,
                startingAmortization: p.startingAmortization,
                startDate: p.startDate,
                launchDate: p.launchDate,
                overrideReason: p.overrideReason,
                ticketCount: p._count.tickets,
                storyPoints,
                bugPoints,
            };
        });

        return NextResponse.json(projectsWithStats);
    } catch (error) {
        console.error('Projects API error:', error);
        return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, status, isCapitalizable, overrideReason, startingBalance, startingAmortization, launchDate, amortizationMonths } = body;

        const updated = await prisma.project.update({
            where: { id },
            data: {
                ...(status !== undefined && { status }),
                ...(isCapitalizable !== undefined && { isCapitalizable }),
                ...(overrideReason !== undefined && { overrideReason }),
                ...(startingBalance !== undefined && { startingBalance }),
                ...(startingAmortization !== undefined && { startingAmortization }),
                ...(launchDate !== undefined && { launchDate: launchDate ? new Date(launchDate) : null }),
                ...(amortizationMonths !== undefined && { amortizationMonths }),
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Project update error:', error);
        return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }
}
