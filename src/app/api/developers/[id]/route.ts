import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const developer = await prisma.developer.findUnique({
            where: { id: params.id },
            include: {
                tickets: {
                    include: { project: { select: { id: true, name: true, epicKey: true, status: true, isCapitalizable: true } } },
                    orderBy: { resolutionDate: 'desc' },
                },
            },
        });

        if (!developer) {
            return NextResponse.json({ error: 'Developer not found' }, { status: 404 });
        }

        const loadedCost = developer.monthlySalary + (developer.monthlySalary * developer.fringeBenefitRate) + developer.stockCompAllocation;
        const totalPoints = developer.tickets.reduce((s, t) => s + t.storyPoints, 0);
        const storyPoints = developer.tickets.filter((t) => t.issueType === 'STORY').reduce((s, t) => s + t.storyPoints, 0);
        const bugPoints = developer.tickets.filter((t) => t.issueType === 'BUG').reduce((s, t) => s + t.storyPoints, 0);
        const taskPoints = developer.tickets.filter((t) => t.issueType === 'TASK').reduce((s, t) => s + t.storyPoints, 0);

        const capPoints = developer.tickets
            .filter((t) => t.issueType === 'STORY' && t.project.isCapitalizable && t.project.status === 'DEV')
            .reduce((s, t) => s + t.storyPoints, 0);

        return NextResponse.json({
            ...developer,
            loadedCost,
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
