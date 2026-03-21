import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeLoadedCost } from '@/lib/costUtils';

/**
 * Returns monthly cost breakdown by ticket type (Story, Bug, Task, Epic, Subtask)
 * 
 * Strategy: For each ticket-month, use the CLOSEST payroll record to determine
 * each developer's loaded cost, then distribute that cost across tickets by SP ratio.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start') || searchParams.get('startDate');
        const endParam = searchParams.get('end') || searchParams.get('endDate');

        // ── Parallelize all independent queries ──
        const [fringeConfig, developers, payrollImports, allTicketsRaw] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
            prisma.developer.findMany({
                where: { isActive: true },
                select: { id: true, fringeBenefitRate: true, stockCompAllocation: true },
            }),
            prisma.payrollImport.findMany({
                orderBy: { payDate: 'desc' },
                include: { entries: { select: { developerId: true, grossSalary: true } } },
            }),
            prisma.jiraTicket.findMany({
                select: {
                    assigneeId: true, storyPoints: true, projectId: true,
                    issueType: true, resolutionDate: true, createdAt: true,
                    customFields: true,
                },
            }),
        ]);

        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;

        // ── Build developer Map for O(1) lookup ──
        const devMap = new Map(developers.map(d => [d.id, d]));

        // ── Build salary lookups ──
        const latestSalaryByDev: Record<string, number> = {};
        if (payrollImports.length > 0) {
            for (const entry of payrollImports[0].entries) {
                latestSalaryByDev[entry.developerId] = entry.grossSalary;
            }
        }

        const monthlySalary: Record<string, Record<string, number>> = {};
        for (const imp of payrollImports) {
            const pd = new Date(imp.payDate);
            const monthKey = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlySalary[monthKey]) monthlySalary[monthKey] = {};
            for (const entry of imp.entries) {
                monthlySalary[monthKey][entry.developerId] = entry.grossSalary;
            }
        }

        // ── Group tickets by payroll month using "open during period" logic ──
        // For each payroll month, find tickets that were open during that month:
        //   - Still open (no resolutionDate)
        //   - Resolved during that month
        const monthlyByType: Record<string, Record<string, number>> = {};

        // Get unique payroll months
        const payrollMonths = new Set<string>();
        for (const imp of payrollImports) {
            const pd = new Date(imp.payDate);
            payrollMonths.add(`${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`);
        }

        // Optionally filter to requested date range
        let filteredMonths = Array.from(payrollMonths).sort();
        if (startParam && endParam) {
            const rangeStart = new Date(startParam + 'T00:00:00');
            const rangeEnd = new Date(endParam + 'T23:59:59');
            filteredMonths = filteredMonths.filter(key => {
                const [y, m] = key.split('-').map(Number);
                const monthDate = new Date(y, m - 1, 1);
                return monthDate >= new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1) &&
                       monthDate <= rangeEnd;
            });
        }

        for (const monthKey of filteredMonths) {
            if (!monthlyByType[monthKey]) {
                monthlyByType[monthKey] = { Story: 0, Bug: 0, Task: 0, Epic: 0, Subtask: 0 };
            }

            const [y, m] = monthKey.split('-').map(Number);
            const monthStart = new Date(y, m - 1, 1);
            const monthEnd = new Date(y, m, 0, 23, 59, 59);

            const salaryLookup = monthlySalary[monthKey] || latestSalaryByDev;

            // Find tickets "open during period" and group by developer
            const ticketsByDevInMonth: Record<string, typeof allTicketsRaw> = {};
            for (const t of allTicketsRaw) {
                if (!t.assigneeId) continue;
                // "Open during period": still open OR resolved during this month
                if (t.resolutionDate) {
                    const rd = new Date(t.resolutionDate);
                    if (rd < monthStart || rd > monthEnd) continue; // resolved outside this month
                }
                if (!ticketsByDevInMonth[t.assigneeId]) ticketsByDevInMonth[t.assigneeId] = [];
                ticketsByDevInMonth[t.assigneeId].push(t);
            }

            for (const [devId, devTickets] of Object.entries(ticketsByDevInMonth)) {
                // O(1) Map lookup instead of O(n) find
                const dev = devMap.get(devId);
                if (!dev) continue;

                const salary = (typeof salaryLookup === 'object' && !Array.isArray(salaryLookup))
                    ? (salaryLookup as Record<string, number>)[devId] || latestSalaryByDev[devId] || 0
                    : 0;
                if (salary <= 0) continue;

                const fringeRate = dev.fringeBenefitRate || globalFringeRate;
                const sbc = dev.stockCompAllocation;
                const totalCost = computeLoadedCost(salary, fringeRate, sbc);
                if (totalCost <= 0) continue;

                const totalPoints = devTickets.reduce((s, t) => s + t.storyPoints, 0);
                if (totalPoints <= 0) continue;

                const typePoints: Record<string, number> = {};
                for (const t of devTickets) {
                    const normalized = normalizeIssueType(t.issueType);
                    typePoints[normalized] = (typePoints[normalized] || 0) + t.storyPoints;
                }

                for (const [type, points] of Object.entries(typePoints)) {
                    const amount = (points / totalPoints) * totalCost;
                    monthlyByType[monthKey][type] = (monthlyByType[monthKey][type] || 0) + amount;
                }
            }
        }

        // ── Format response ──
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const sortedMonths = Object.keys(monthlyByType).sort();

        const chartData = sortedMonths.map(key => {
            const [yearStr, monthStr] = key.split('-');
            const monthIdx = parseInt(monthStr) - 1;
            const d = monthlyByType[key];
            return {
                label: `${monthNames[monthIdx]} ${yearStr}`,
                Story: Math.round((d.Story || 0) * 100) / 100,
                Bug: Math.round((d.Bug || 0) * 100) / 100,
                Task: Math.round((d.Task || 0) * 100) / 100,
                Epic: Math.round((d.Epic || 0) * 100) / 100,
                Subtask: Math.round((d.Subtask || 0) * 100) / 100,
            };
        });

        return NextResponse.json(chartData);
    } catch (error) {
        console.error('Cost by ticket type error:', error);
        return NextResponse.json({ error: 'Failed to load cost by ticket type' }, { status: 500 });
    }
}

function normalizeIssueType(type: string): string {
    const upper = (type || 'Task').toUpperCase();
    if (upper === 'STORY') return 'Story';
    if (upper === 'BUG') return 'Bug';
    if (upper === 'EPIC') return 'Epic';
    if (upper === 'SUBTASK' || upper === 'SUB-TASK') return 'Subtask';
    return 'Task';
}
