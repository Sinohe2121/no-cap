export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');

        const tickets = await prisma.jiraTicket.findMany({
            include: {
                assignee: { select: { id: true, name: true, role: true, isActive: true } },
                project: { select: { id: true, name: true, status: true, epicKey: true, isCapitalizable: true } },
                auditTrails: { select: { id: true, allocatedAmount: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const now = new Date();

        let formatted = tickets.map((t: any) => {
            const allocatedCost = t.auditTrails.reduce((sum: number, a: { allocatedAmount: number }) => sum + a.allocatedAmount, 0);
            const capAmount = allocatedCost > 0 ? allocatedCost : t.capitalizedAmount;
            const amortMonths = t.amortizationMonths || 36;

            // Compute amortization inline (same logic as calculateTicketAmortization)
            let accumulatedAmortization = 0;
            let netBookValue = capAmount;
            let monthlyAmortization = 0;

            if (t.resolutionDate && capAmount > 0 && amortMonths > 0) {
                const rd = new Date(t.resolutionDate);
                const amortStart = new Date(rd.getFullYear(), rd.getMonth() + 1, 1);
                if (now >= amortStart) {
                    monthlyAmortization = capAmount / amortMonths;
                    const monthsElapsed = Math.min(
                        amortMonths,
                        Math.max(0,
                            (now.getFullYear() - amortStart.getFullYear()) * 12 +
                            (now.getMonth() - amortStart.getMonth()) + 1
                        )
                    );
                    accumulatedAmortization = Math.round(monthlyAmortization * monthsElapsed * 100) / 100;
                    netBookValue = Math.max(0, Math.round((capAmount - accumulatedAmortization) * 100) / 100);
                    monthlyAmortization = Math.round(monthlyAmortization * 100) / 100;
                }
            }

            return {
                id: t.id,
                ticketId: t.ticketId,
                epicKey: t.epicKey,
                issueType: t.issueType,
                summary: t.summary,
                storyPoints: t.storyPoints,
                resolutionDate: t.resolutionDate,
                fixVersion: t.fixVersion,
                createdAt: t.createdAt,
                assignee: t.assignee,
                assigneeId: t.assigneeId,
                project: t.project,
                allocatedCost,
                capitalizedAmount: capAmount,
                amortizationMonths: amortMonths,
                monthlyAmortization,
                accumulatedAmortization,
                netBookValue,
                firstCapitalizedDate: t.firstCapitalizedDate,
                monthsCapitalized: t.firstCapitalizedDate
                    ? Math.max(1, Math.ceil(
                        (Date.now() - new Date(t.firstCapitalizedDate).getTime()) /
                        (1000 * 60 * 60 * 24 * 30.44)
                      ))
                    : null,
                customFields: t.customFields,
                importPeriod: t.importPeriod,
            };
        });

        // Filter by date range using the original Jira creation date (customFields.Created)
        // Falls back to DB createdAt if the Jira date isn't available
        if (startParam && endParam) {
            const rangeStart = new Date(startParam + 'T00:00:00').getTime();
            const rangeEnd = new Date(endParam + 'T23:59:59').getTime();

            formatted = formatted.filter(t => {
                const jiraCreated = (t.customFields as any)?.Created;
                const dateStr = jiraCreated || t.createdAt;
                const ts = new Date(dateStr).getTime();
                if (isNaN(ts)) return true; // Keep tickets with unparseable dates
                return ts >= rangeStart && ts <= rangeEnd;
            });
        }

        const configRow = await prisma.globalConfig.findUnique({
            where: { key: 'jira_custom_fields' },
        });
        
        let customFieldsConfig: { id: string; name: string }[] = [];
        if (configRow && configRow.value) {
            try {
                const parsed = JSON.parse(configRow.value);
                if (parsed.length > 0 && typeof parsed[0] === 'string') {
                    customFieldsConfig = parsed.map((id: string) => ({ id, name: id }));
                } else {
                    customFieldsConfig = parsed;
                }
            } catch {}
        }

        return NextResponse.json({ tickets: formatted, customFieldsConfig });
    } catch (error) {
        console.error('Tickets API error:', error);
        return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 });
    }
}
