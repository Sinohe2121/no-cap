export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeLoadedCost } from '@/lib/costUtils';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');
        const now = new Date();
        const periodEnd = endParam ? new Date(endParam + 'T23:59:59') : now;
        const periodStart = startParam ? new Date(startParam + 'T00:00:00') : new Date(now.getFullYear(), 0, 1);

        // ── Parallelize all independent queries ──
        const [projects, fringeConfig, developers, payrollImports, allTickets, accountingPeriods] = await Promise.all([
            prisma.project.findMany({
                include: { _count: { select: { tickets: true } } },
            }),
            prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
            prisma.developer.findMany({
                where: { isActive: true },
                select: { id: true, fringeBenefitRate: true, stockCompAllocation: true },
            }),
            prisma.payrollImport.findMany({
                orderBy: { payDate: 'asc' },
                include: { entries: { select: { developerId: true, grossSalary: true } } },
            }),
            prisma.jiraTicket.findMany({
                select: {
                    assigneeId: true, storyPoints: true, projectId: true,
                    issueType: true, resolutionDate: true, createdAt: true,
                },
            }),
            prisma.accountingPeriod.findMany(),
        ]);

        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;

        // ── Pre-group tickets by assigneeId for O(1) lookup ──
        const ticketsByDev = new Map<string, typeof allTickets>();
        for (const t of allTickets) {
            if (!t.assigneeId) continue;
            const arr = ticketsByDev.get(t.assigneeId);
            if (arr) arr.push(t);
            else ticketsByDev.set(t.assigneeId, [t]);
        }

        // ── Build amortization lookup from all accounting periods ──
        const allAmortByMonth: Record<string, number> = {};
        let ytdAmortization = 0;
        let totalCapitalizedYtd = 0;
        let totalExpensedYtd = 0;
        const startYear = periodStart.getFullYear();
        const startMonth = periodStart.getMonth() + 1;
        const endYear = periodEnd.getFullYear();
        const endMonth = periodEnd.getMonth() + 1;

        for (const ap of accountingPeriods) {
            const key = `${ap.year}-${String(ap.month).padStart(2, '0')}`;
            allAmortByMonth[key] = (allAmortByMonth[key] || 0) + ap.totalAmortization;

            // Check if this period falls within the selected range
            const inRange = (ap.year > startYear || (ap.year === startYear && ap.month >= startMonth)) &&
                            (ap.year < endYear || (ap.year === endYear && ap.month <= endMonth));
            if (inRange) {
                ytdAmortization += ap.totalAmortization;
                totalCapitalizedYtd += ap.totalCapitalized;
                totalExpensedYtd += ap.totalExpensed;
            }
        }

        // ── Compute per-project, per-month costs from payroll distribution ──
        const projectItdCost: Record<string, number> = {};
        const monthlyData: Record<string, { capex: number; opex: number }> = {};
        let totalCapexYtd = 0;

        const projectMap: Record<string, { isCapitalizable: boolean; status: string }> = {};
        for (const p of projects) {
            projectMap[p.id] = { isCapitalizable: p.isCapitalizable, status: p.status };
            projectItdCost[p.id] = 0;
        }

        for (const imp of payrollImports) {
            const pd = new Date(imp.payDate);
            const monthStart = new Date(pd.getFullYear(), pd.getMonth(), 1);
            const monthEnd = new Date(pd.getFullYear(), pd.getMonth() + 1, 0, 23, 59, 59);
            const monthKey = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
            const isInPeriod = monthEnd >= periodStart && monthStart <= periodEnd;

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { capex: 0, opex: 0 };
            }

            const salaryByDev: Record<string, number> = {};
            for (const entry of imp.entries) {
                salaryByDev[entry.developerId] = entry.grossSalary;
            }

            for (const dev of developers) {
                const salary = salaryByDev[dev.id] || 0;
                const fringeRate = dev.fringeBenefitRate || globalFringeRate;
                const sbc = dev.stockCompAllocation;
                const totalCost = computeLoadedCost(salary, fringeRate, sbc);
                if (totalCost <= 0) continue;

                // O(1) lookup instead of O(n) filter
                const devTickets = (ticketsByDev.get(dev.id) || []).filter(t => {
                    if (!t.resolutionDate) return true;
                    const rd = new Date(t.resolutionDate);
                    return rd >= monthStart && rd <= monthEnd;
                });

                const totalPoints = devTickets.reduce((s, t) => s + t.storyPoints, 0);
                if (totalPoints <= 0) continue;

                // Split costs by ticket type: STORY on capitalizable+DEV project = CAPEX, else OPEX
                const projPoints: Record<string, { points: number; isCapex: boolean }> = {};
                for (const t of devTickets) {
                    if (!t.projectId) continue;
                    const pm = projectMap[t.projectId];
                    const isCapex = pm
                        ? pm.isCapitalizable && t.issueType === 'STORY'
                        : false;
                    // Use composite key so same project can have both CAPEX and OPEX entries
                    const key = `${t.projectId}::${isCapex ? 'cap' : 'exp'}`;
                    if (!projPoints[key]) {
                        projPoints[key] = { points: 0, isCapex };
                    }
                    projPoints[key].points += t.storyPoints;
                }

                for (const [compositeKey, info] of Object.entries(projPoints)) {
                    const projId = compositeKey.split('::')[0];
                    const amount = (info.points / totalPoints) * totalCost;
                    if (!projectItdCost[projId]) projectItdCost[projId] = 0;
                    projectItdCost[projId] += amount;

                    if (info.isCapex) {
                        monthlyData[monthKey].capex += amount;
                    } else {
                        monthlyData[monthKey].opex += amount;
                    }

                    if (isInPeriod && info.isCapex) {
                        totalCapexYtd += amount;
                    }
                }
            }
        }

        const projectsWithCosts = projects.map((p) => {
            const derivedCost = projectItdCost[p.id] || 0;
            const totalCostForProject = derivedCost + p.startingBalance;
            return { ...p, derivedCost, totalCostForProject };
        });

        const activeDeveloperCount = developers.length;

        const topProjects = projectsWithCosts
            .filter((p) => p.isCapitalizable && p.totalCostForProject > 0)
            .sort((a, b) => b.totalCostForProject - a.totalCostForProject)
            .slice(0, 5);

        // Alerts: only flag genuinely actionable issues
        // Amortization is ticket-level (based on ticket resolutionDate), not project-level.
        // LIVE status is normal — no alerts needed for properly operating projects.
        const alerts: { id: string; name: string; message: string; severity: string }[] = [];

        // Flag capitalizable projects that have zero capitalized tickets
        // (may indicate no journal entries have been generated yet)
        for (const p of projects) {
            if (p.isCapitalizable && p.status === 'LIVE') {
                const capTicketCount = await prisma.jiraTicket.count({
                    where: { projectId: p.id, capitalizedAmount: { gt: 0 } },
                });
                if (capTicketCount === 0) {
                    alerts.push({
                        id: p.id,
                        name: p.name,
                        severity: 'warning',
                        message: `${p.name} is capitalizable and Live but has no capitalized tickets. Ensure journal entries have been generated for the relevant periods.`,
                    });
                }
            }
        }

        // ── Build chart data ──
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const sortedMonths = Object.keys(monthlyData).sort();
        const chartMonths = sortedMonths.slice(-12);

        const chartData = chartMonths.map((key) => {
            const [yearStr, monthStr] = key.split('-');
            const monthIdx = parseInt(monthStr) - 1;
            const d = monthlyData[key];
            return {
                label: `${monthNames[monthIdx]} ${yearStr.slice(2)}`,
                capex: Math.round(d.capex * 100) / 100,
                opex: Math.round(d.opex * 100) / 100,
                amortization: 0,
            };
        });

        // Running NAV chart
        let runCap = 0;
        let runAmort = 0;
        for (const proj of projects) {
            runCap += proj.startingBalance;
            runAmort += proj.startingAmortization;
        }

        const preChartMonths = sortedMonths.slice(0, -12);
        for (const key of preChartMonths) {
            runCap += monthlyData[key].capex;
        }

        const assetChartData = chartMonths.map((key) => {
            const [yearStr, monthStr] = key.split('-');
            const monthIdx = parseInt(monthStr) - 1;
            const d = monthlyData[key];
            runCap += d.capex;
            const monthAmort = allAmortByMonth[key] || 0;
            runAmort += monthAmort;

            return {
                label: `${monthNames[monthIdx]} ${yearStr.slice(2)}`,
                capitalized: Math.round(runCap * 100) / 100,
                amortized: -Math.round(runAmort * 100) / 100,
                netAsset: Math.round((runCap - runAmort) * 100) / 100,
            };
        });

        return NextResponse.json({
            summary: {
                totalAssetValue: totalCapitalizedYtd,
                totalExpensed: totalExpensedYtd,
                ytdAmortization,
                activeDeveloperCount,
                totalProjects: projects.length,
            },
            topProjects: topProjects.map((p) => ({
                id: p.id,
                name: p.name,
                cost: p.totalCostForProject,
                status: p.status,
            })),
            chartData,
            assetChartData,
            alerts,
            periodLabel: {
                start: periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                end: periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            },
        });
    } catch (error) {
        console.error('Dashboard API error:', error);
        return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
    }
}
