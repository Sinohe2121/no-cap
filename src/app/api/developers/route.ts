import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const developers = await prisma.developer.findMany({
            include: {
                tickets: {
                    select: { storyPoints: true, issueType: true, project: { select: { isCapitalizable: true, status: true } } },
                },
            },
            orderBy: { name: 'asc' },
        });

        const devsWithStats = developers.map((dev) => {
            const loadedCost = dev.monthlySalary + (dev.monthlySalary * dev.fringeBenefitRate) + dev.stockCompAllocation;
            const totalPoints = dev.tickets.reduce((s, t) => s + t.storyPoints, 0);
            const capPoints = dev.tickets
                .filter((t) => t.issueType === 'STORY' && t.project.isCapitalizable && t.project.status === 'DEV')
                .reduce((s, t) => s + t.storyPoints, 0);
            const capRatio = totalPoints > 0 ? capPoints / totalPoints : 0;

            return {
                id: dev.id,
                name: dev.name,
                email: dev.email,
                jiraUserId: dev.jiraUserId,
                role: dev.role,
                isActive: dev.isActive,
                monthlySalary: dev.monthlySalary,
                fringeBenefitRate: dev.fringeBenefitRate,
                stockCompAllocation: dev.stockCompAllocation,
                loadedCost,
                totalPoints,
                capPoints,
                expPoints: totalPoints - capPoints,
                capRatio,
                ticketCount: dev.tickets.length,
            };
        });

        return NextResponse.json(devsWithStats);
    } catch (error) {
        console.error('Developers API error:', error);
        return NextResponse.json({ error: 'Failed to load developers' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, monthlySalary, stockCompAllocation, fringeBenefitRate, isActive } = body;

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
