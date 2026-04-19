export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';

// Computes QRE (Qualified Research Expenses) for a given year
// Used by the Form 6765 / R&D Credit page
export async function GET(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const { searchParams } = new URL(request.url);
        const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

        // 1. Load global config
        const [fringeConfig, meetingConfig] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
            prisma.globalConfig.findUnique({ where: { key: 'MEETING_TIME_RATE' } }),
        ]);
        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;

        // 2. Load payroll imports for this year with entries
        const payrollImports = await prisma.payrollImport.findMany({
            where: { year },
            orderBy: { payDate: 'asc' },
            include: {
                entries: {
                    where: { grossSalary: { gt: 1 } },
                    include: {
                        developer: { select: { id: true, name: true, role: true } },
                    },
                },
            },
        });

        // 3. Load all tickets with project (includes isQRE on both)
        const allTickets = await prisma.jiraTicket.findMany({
            where: {
                OR: [
                    { importPeriod: { not: null } },
                    { resolutionDate: { not: null } },
                ],
            },
            include: {
                project: { select: { id: true, name: true, isQRE: true } as any },
                assignee: { select: { id: true, name: true } },
            },
        });

        // 4. Load contractor research entries for this year
        const contractors = await (prisma as any).contractResearch.findMany({
            where: { year },
            orderBy: { period: 'asc' },
        });

        // 5. For each payroll period, compute QRE wages per developer
        interface DevQRE {
            devId: string;
            devName: string;
            role: string;
            period: string;
            totalNetCost: number;
            qreWages: number;
            qrePct: number;
            totalSP: number;
            qreSP: number;
        }

        const devQRERows: DevQRE[] = [];

        // Project QRE lookup
        const ticketQREMap = new Map<string, boolean>();
        for (const t of allTickets) {
            if ((t as any).isQRE === true) { ticketQREMap.set(t.id, true); continue; }
            if ((t as any).isQRE === false) { ticketQREMap.set(t.id, false); continue; }
            // null → inherit from project
            ticketQREMap.set(t.id, (t as any).project?.isQRE ?? false);
        }

        for (const imp of payrollImports) {
            const fringeRate: number = (imp as any).fringeBenefitRate ?? globalFringeRate;
            const meetingRate: number = (imp as any).meetingTimeRate ?? 0;

            // Determine date window for this period
            const pd = new Date(imp.payDate);
            const monthStart = new Date(pd.getFullYear(), pd.getMonth(), 1);
            const monthEnd = new Date(pd.getFullYear(), pd.getMonth() + 1, 0, 23, 59, 59);

            // Tickets in this period
            const periodTickets = allTickets.filter((t) => {
                if (t.importPeriod === imp.label) return true;
                const rd = t.resolutionDate ? new Date(t.resolutionDate) : new Date(t.createdAt);
                return rd >= monthStart && rd <= monthEnd;
            });

            // Total and QRE story points per developer
            const devTotalSP: Record<string, number> = {};
            const devQRESP: Record<string, number> = {};
            for (const t of periodTickets) {
                if (!t.assigneeId) continue;
                devTotalSP[t.assigneeId] = (devTotalSP[t.assigneeId] || 0) + t.storyPoints;
                if (ticketQREMap.get(t.id)) {
                    devQRESP[t.assigneeId] = (devQRESP[t.assigneeId] || 0) + t.storyPoints;
                }
            }

            // Build per-developer QRE rows
            for (const entry of imp.entries) {
                const dev = entry.developer;
                const salary = entry.grossSalary;
                const sbc: number = (entry as any).sbcAmount ?? 0;
                const fringe = salary * fringeRate;
                const loadedCost = salary + fringe + sbc;
                const netCost = loadedCost * (1 - meetingRate);

                const totalSP = devTotalSP[dev.id] || 0;
                const qreSP = devQRESP[dev.id] || 0;
                const qrePct = totalSP > 0 ? qreSP / totalSP : 0;
                const qreWages = netCost * qrePct;

                if (qreWages > 0 || totalSP > 0) {
                    devQRERows.push({
                        devId: dev.id,
                        devName: dev.name,
                        role: dev.role,
                        period: imp.label,
                        totalNetCost: netCost,
                        qreWages,
                        qrePct,
                        totalSP,
                        qreSP,
                    });
                }
            }
        }

        // 6. Project-level QRE breakdown
        interface ProjectQRE {
            projectId: string;
            projectName: string;
            isQRE: boolean;
            qreWages: number;
        }
        const projectQREMap: Record<string, ProjectQRE> = {};

        for (const imp of payrollImports) {
            const fringeRate: number = (imp as any).fringeBenefitRate ?? globalFringeRate;
            const meetingRate: number = (imp as any).meetingTimeRate ?? 0;

            const pd = new Date(imp.payDate);
            const monthStart = new Date(pd.getFullYear(), pd.getMonth(), 1);
            const monthEnd = new Date(pd.getFullYear(), pd.getMonth() + 1, 0, 23, 59, 59);

            const periodTickets = allTickets.filter((t) => {
                if (t.importPeriod === imp.label) return true;
                const rd = t.resolutionDate ? new Date(t.resolutionDate) : new Date(t.createdAt);
                return rd >= monthStart && rd <= monthEnd;
            });

            // Per developer: SP split by project
            const devTotalSPMap: Record<string, number> = {};
            for (const t of periodTickets) {
                if (!t.assigneeId) continue;
                devTotalSPMap[t.assigneeId] = (devTotalSPMap[t.assigneeId] || 0) + t.storyPoints;
            }

            for (const entry of imp.entries) {
                const dev = entry.developer;
                const salary = entry.grossSalary;
                const sbc: number = (entry as any).sbcAmount ?? 0;
                const fringe = salary * fringeRate;
                const netCost = (salary + fringe + sbc) * (1 - meetingRate);
                const totalSP = devTotalSPMap[dev.id] || 0;
                if (totalSP === 0) continue;

                // Allocate to each project's QRE tickets
                const devTickets = periodTickets.filter(t => t.assigneeId === dev.id && ticketQREMap.get(t.id));
                const ticketsByProject: Record<string, number> = {};
                for (const t of devTickets) {
                    const pid = t.projectId || '__unlinked__';
                    ticketsByProject[pid] = (ticketsByProject[pid] || 0) + t.storyPoints;
                }

                for (const [pid, sp] of Object.entries(ticketsByProject)) {
                    const ticket = allTickets.find(t => t.projectId === pid && t.assigneeId === dev.id);
                    const projName = (ticket as any)?.project?.name || 'Unlinked';
                    const isQRE = (ticket as any)?.project?.isQRE ?? false;
                    const allocated = netCost * (sp / totalSP);
                    if (!projectQREMap[pid]) {
                        projectQREMap[pid] = { projectId: pid, projectName: projName, isQRE, qreWages: 0 };
                    }
                    projectQREMap[pid].qreWages += allocated;
                }
            }
        }

        // 7. Aggregate totals
        const totalQREWages = devQRERows.reduce((s, r) => s + r.qreWages, 0);
        const totalContractQRE = contractors.reduce((s: number, c: any) => s + c.amount * c.qrePct, 0);
        const totalQRE = totalQREWages + totalContractQRE;

        // 8. Per-developer roll-up
        interface DevYearQRE {
            devId: string;
            devName: string;
            role: string;
            totalNetCost: number;
            qreWages: number;
            qrePct: number;
        }
        const devRollup: Record<string, DevYearQRE> = {};
        for (const r of devQRERows) {
            if (!devRollup[r.devId]) {
                devRollup[r.devId] = { devId: r.devId, devName: r.devName, role: r.role, totalNetCost: 0, qreWages: 0, qrePct: 0 };
            }
            devRollup[r.devId].totalNetCost += r.totalNetCost;
            devRollup[r.devId].qreWages += r.qreWages;
        }
        for (const row of Object.values(devRollup)) {
            row.qrePct = row.totalNetCost > 0 ? row.qreWages / row.totalNetCost : 0;
        }

        return NextResponse.json({
            year,
            totalQREWages,
            totalContractQRE,
            totalQRE,
            // ASC credit = 14% × max(0, currentQRE − 50% of prior 3-yr avg)
            // Without prior years in system, user enters manually — we'll return 0 for now
            estimatedCredit: totalQRE * 0.14, // simplified: assumes no prior year base
            developers: Object.values(devRollup).sort((a, b) => b.qreWages - a.qreWages),
            byPeriod: devQRERows,
            projects: Object.values(projectQREMap).sort((a, b) => b.qreWages - a.qreWages),
            contractors,
        });
    } catch (error) {
        return handleApiError(error, 'Failed to compute Form 6765 data');
    }
}
