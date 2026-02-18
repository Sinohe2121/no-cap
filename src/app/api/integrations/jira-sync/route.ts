import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Generate mock Jira tickets
export async function POST() {
    try {
        const developers = await prisma.developer.findMany();
        const projects = await prisma.project.findMany();

        if (developers.length === 0 || projects.length === 0) {
            return NextResponse.json({ error: 'Need developers and projects first' }, { status: 400 });
        }

        const issueTypes = ['STORY', 'STORY', 'STORY', 'BUG', 'TASK']; // Weighted toward stories
        const summaries = {
            STORY: ['Add new API endpoint', 'Build user profile page', 'Implement search feature', 'Create analytics dashboard', 'Add export to CSV', 'Implement SSO login', 'Build notification system', 'Add dark mode toggle', 'Implement file upload'],
            BUG: ['Fix timeout on large queries', 'Patch memory leak in worker', 'Fix UI alignment issue', 'Resolve race condition', 'Fix broken pagination'],
            TASK: ['Update dependencies', 'Write API documentation', 'Set up monitoring alerts', 'Configure staging environment'],
        };

        const newTickets = [];
        const now = new Date();

        for (let i = 0; i < 15; i++) {
            const dev = developers[Math.floor(Math.random() * developers.length)];
            const project = projects[Math.floor(Math.random() * projects.length)];
            const issueType = issueTypes[Math.floor(Math.random() * issueTypes.length)];
            const summaryList = summaries[issueType as keyof typeof summaries];
            const summary = summaryList[Math.floor(Math.random() * summaryList.length)];
            const points = [1, 2, 3, 5, 8, 13][Math.floor(Math.random() * 6)];

            const daysAgo = Math.floor(Math.random() * 30);
            const resolutionDate = new Date(now.getTime() - daysAgo * 86400000);

            const ticketNum = Math.floor(Math.random() * 900) + 100;
            const ticketId = `${project.epicKey}-${ticketNum}`;

            newTickets.push({
                ticketId,
                epicKey: project.epicKey,
                issueType,
                summary: `${summary} [Synced]`,
                storyPoints: points,
                resolutionDate,
                assigneeId: dev.id,
                projectId: project.id,
            });
        }

        let created = 0;
        for (const ticket of newTickets) {
            try {
                await prisma.jiraTicket.create({ data: ticket });
                created++;
            } catch {
                // Skip duplicates
            }
        }

        return NextResponse.json({ message: `Synced ${created} new tickets`, count: created });
    } catch (error) {
        console.error('Jira sync error:', error);
        return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
    }
}
