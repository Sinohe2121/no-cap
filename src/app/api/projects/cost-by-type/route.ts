export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeLoadedCost } from '@/lib/costUtils';

/**
 * Returns monthly cost breakdown by ticket type (Story, Bug, Task, Epic, Subtask).
 * Also returns a separate `Capex` field = STORY tickets on capitalizable projects only.
 *
 * Formula matches the dashboard CAPEX card exactly:
 *   ticketCost = (appliedSP / devTotalAppliedSP) × devNetCost
 *   devNetCost = computeLoadedCost(salary, fringe, sbc) × (1 − meetingRate)
 *
 * Applied SP: bugs/others with 0 Jira SP use configured fallback values.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start') || searchParams.get('startDate');
        const endParam = searchParams.get('end') || searchParams.get('endDate');

        // ── Load configs and data in parallel ──
        const [fringeConfig, meetingConfig, bugSpConfig, otherSpConfig, developers, payrollImports, allTicketsRaw, projects] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
            prisma.globalConfig.findUnique({ where: { key: 'MEETING_TIME_RATE' } }),
            prisma.globalConfig.findUnique({ where: { key: 'BUG_SP_FALLBACK' } }),
            prisma.globalConfig.findUnique({ where: { key: 'OTHER_SP_FALLBACK' } }),
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
                },
            }),
            prisma.project.findMany({ select: { id: true, isCapitalizable: true } }),
        ]);

        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;
        const globalMeetingRate = meetingConfig ? parseFloat(meetingConfig.value) : 0;
        const bugSpFallback = parseFloat(bugSpConfig?.value ?? '1') || 1;
        const otherSpFallback = parseFloat(otherSpConfig?.value ?? '1') || 1;

        // Applied SP: 0-SP bugs/tasks get a fallback so they carry their cost weight
        const appliedSP = (t: { storyPoints: number; issueType: string }): number =>
            t.storyPoints > 0 ? t.storyPoints
            : t.issueType?.toUpperCase() === 'BUG' ? bugSpFallback : otherSpFallback;

        // Quick lookups
        const devMap = new Map(developers.map(d => [d.id, d]));
        const capitalizable = new Set(projects.filter(p => p.isCapitalizable).map(p => p.id));

        // Build monthly salary table
        const latestSalaryByDev: Record<string, number> = {};
        if (payrollImports.length > 0) {
            for (const entry of payrollImports[0].entries) {
                latestSalaryByDev[entry.developerId] = entry.grossSalary;
            }
        }
        const monthlySalary: Record<string, Record<string, number>> = {};
        for (const imp of payrollImports) {
            const pd = new Date(imp.payDate);
            const key = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlySalary[key]) monthlySalary[key] = {};
            for (const entry of imp.entries) {
                monthlySalary[key][entry.developerId] = entry.grossSalary;
            }
        }

        // Determine payroll months to process, optionally filtered to requested range
        const payrollMonths = new Set<string>();
        for (const imp of payrollImports) {
            const pd = new Date(imp.payDate);
            payrollMonths.add(`${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`);
        }
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

        // ── Compute monthly cost breakdown ──
        const monthlyByType: Record<string, Record<string, number>> = {};

        for (const monthKey of filteredMonths) {
            monthlyByType[monthKey] = { Story: 0, Bug: 0, Task: 0, Epic: 0, Subtask: 0, Capex: 0 };

            const [y, m] = monthKey.split('-').map(Number);
            const monthStart = new Date(y, m - 1, 1);
            const monthEnd = new Date(y, m, 0, 23, 59, 59);

            const salaryLookup = monthlySalary[monthKey] || latestSalaryByDev;

            // Group tickets open during this month by developer
            const ticketsByDevInMonth: Record<string, typeof allTicketsRaw> = {};
            for (const t of allTicketsRaw) {
                if (!t.assigneeId) continue;
                if (t.resolutionDate) {
                    const rd = new Date(t.resolutionDate);
                    if (rd < monthStart || rd > monthEnd) continue;
                }
                if (!ticketsByDevInMonth[t.assigneeId]) ticketsByDevInMonth[t.assigneeId] = [];
                ticketsByDevInMonth[t.assigneeId].push(t);
            }

            for (const [devId, devTickets] of Object.entries(ticketsByDevInMonth)) {
                const dev = devMap.get(devId);
                if (!dev) continue;

                const salary = (salaryLookup as Record<string, number>)[devId] || latestSalaryByDev[devId] || 0;
                if (salary <= 0) continue;

                const fringeRate = dev.fringeBenefitRate || globalFringeRate;
                const sbc = dev.stockCompAllocation;
                const grossCost = computeLoadedCost(salary, fringeRate, sbc);
                // Apply meeting rate — matches dashboard CAPEX formula exactly
                const netCost = grossCost * (1 - globalMeetingRate);
                if (netCost <= 0) continue;

                // Applied SP denominator includes 0-SP bugs/tasks via fallback
                const totalPoints = devTickets.reduce((s, t) => s + appliedSP(t), 0);
                if (totalPoints <= 0) continue;

                // Distribute cost proportionally by applied SP, tracking both type and capex bucket
                const typePoints: Record<string, number> = {};
                let capexPoints = 0;
                for (const t of devTickets) {
                    const sp = appliedSP(t);
                    const normalized = normalizeIssueType(t.issueType);
                    typePoints[normalized] = (typePoints[normalized] || 0) + sp;
                    // Capex = STORY tickets on capitalizable projects (ASC 350-40)
                    if (t.issueType?.toUpperCase() === 'STORY' && t.projectId && capitalizable.has(t.projectId)) {
                        capexPoints += sp;
                    }
                }

                for (const [type, points] of Object.entries(typePoints)) {
                    const amount = (points / totalPoints) * netCost;
                    monthlyByType[monthKey][type] = (monthlyByType[monthKey][type] || 0) + amount;
                }
                monthlyByType[monthKey].Capex += (capexPoints / totalPoints) * netCost;
            }
        }

        // ── Format response ──
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const sortedMonths = Object.keys(monthlyByType).sort();

        const chartData = sortedMonths.map(key => {
            const [yearStr, monthStr] = key.split('-');
            const monthIdx = parseInt(monthStr) - 1;
            const d = monthlyByType[key];
            const monthHeadcount = monthlySalary[key] ? Object.keys(monthlySalary[key]).length : 0;
            return {
                label: `${monthNames[monthIdx]} ${yearStr}`,
                Story: Math.round((d.Story || 0) * 100) / 100,
                Bug: Math.round((d.Bug || 0) * 100) / 100,
                Task: Math.round((d.Task || 0) * 100) / 100,
                Epic: Math.round((d.Epic || 0) * 100) / 100,
                Subtask: Math.round((d.Subtask || 0) * 100) / 100,
                Capex: Math.round((d.Capex || 0) * 100) / 100,
                headcount: monthHeadcount,
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
