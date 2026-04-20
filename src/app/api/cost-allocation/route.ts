export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeLoadedCost } from '@/lib/costUtils';

interface DevRow {
    id: string;
    name: string;
    email: string;
    role: string;
    fringeBenefitRate: number;
    stockCompAllocation: number;
}

interface PayrollImportRow {
    id: string;
    label: string;
    payDate: Date;
    year: number;
    entries: { developerId: string; grossSalary: number }[];
}

interface ProjectDistribution {
    projectId: string;
    projectName: string;
    points: number;
    ratio: number;
    amount: number;
}

export async function GET() {
    try {
        // ── 1. Load system fringe rate ────────────────────────────────
        const fringeConfig = await prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } });
        const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;

        // ── 2. Load developers ────────────────────────────────────────
        const developers: DevRow[] = await prisma.developer.findMany({
            where: { isActive: true },
            select: {
                id: true, name: true, email: true, role: true,
                fringeBenefitRate: true, stockCompAllocation: true,
            },
            orderBy: { name: 'asc' },
        });

        // ── 3. Load payroll imports with entries ──────────────────────
        const payrollImports: PayrollImportRow[] = await prisma.payrollImport.findMany({
            orderBy: { payDate: 'asc' },
            include: {
                entries: { select: { developerId: true, grossSalary: true } },
            },
        });

        // ── 4. Load all tickets with project info for distribution ───
        const allTickets = await prisma.jiraTicket.findMany({
            where: { assigneeId: { in: developers.map(d => d.id) } },
            select: {
                assigneeId: true,
                projectId: true,
                storyPoints: true,
                resolutionDate: true,
                project: { select: { id: true, name: true } },
            },
        });

        // ── 4a. Pre-bucket tickets by assignee, splitting open vs resolved ──
        // The previous implementation re-scanned `allTickets` once per
        // (developer × payroll import) — O(D × I × T). For 50 devs × 12 months
        // × 5k tickets that's 3M comparisons. We bucket once up front so each
        // inner-loop lookup is O(devTickets) instead of O(allTickets).
        type DevTicket = (typeof allTickets)[number];
        const openByDev = new Map<string, DevTicket[]>();
        const resolvedByDev = new Map<string, DevTicket[]>();
        for (const t of allTickets) {
            if (!t.assigneeId) continue;
            const target = t.resolutionDate ? resolvedByDev : openByDev;
            const arr = target.get(t.assigneeId);
            if (arr) arr.push(t);
            else target.set(t.assigneeId, [t]);
        }

        // ── 5. Build cost allocation matrix ──────────────────────────
        // Shape: allocationMap[devId][importId] = { salary, fringe, sbc, totalCost, distributions[] }
        type CellData = {
            salary: number;
            fringe: number;
            sbc: number;
            totalCost: number;
            distributions: ProjectDistribution[];
        };

        const allocationMap: Record<string, Record<string, CellData>> = {};
        const columnTotals: Record<string, number> = {};
        const devTotals: Record<string, number> = {};

        for (const dev of developers) {
            allocationMap[dev.id] = {};
            devTotals[dev.id] = 0;
        }

        for (const imp of payrollImports) {
            columnTotals[imp.id] = 0;

            // Build salary lookup for this period
            const salaryByDev: Record<string, number> = {};
            for (const entry of imp.entries) {
                salaryByDev[entry.developerId] = entry.grossSalary;
            }

            // Determine month window for ticket distribution
            const pd = new Date(imp.payDate);
            const monthStart = new Date(pd.getFullYear(), pd.getMonth(), 1);
            const monthEnd = new Date(pd.getFullYear(), pd.getMonth() + 1, 0, 23, 59, 59);

            for (const dev of developers) {
                const salary = salaryByDev[dev.id] || 0;
                const fringeRate = dev.fringeBenefitRate || globalFringeRate;
                const fringe = salary * fringeRate;
                const sbc = dev.stockCompAllocation;
                const totalCost = computeLoadedCost(salary, fringeRate, sbc);

                // Find tickets "open during period" for this dev in this month
                // = still open (no resolutionDate) OR resolved during this month
                const openForDev = openByDev.get(dev.id) ?? [];
                const resolvedForDev = resolvedByDev.get(dev.id) ?? [];
                const devTickets: DevTicket[] = [
                    ...openForDev,
                    ...resolvedForDev.filter(t =>
                        t.resolutionDate! >= monthStart && t.resolutionDate! <= monthEnd
                    ),
                ];

                const totalPoints = devTickets.reduce((s, t) => s + t.storyPoints, 0);

                // Build project distribution
                const projMap: Record<string, { projectId: string; projectName: string; points: number }> = {};
                for (const t of devTickets) {
                    if (!t.projectId || !t.project) continue;
                    if (!projMap[t.projectId]) {
                        projMap[t.projectId] = { projectId: t.project.id, projectName: t.project.name, points: 0 };
                    }
                    projMap[t.projectId].points += t.storyPoints;
                }

                const distributions: ProjectDistribution[] = Object.values(projMap).map(p => ({
                    ...p,
                    ratio: totalPoints > 0 ? p.points / totalPoints : 0,
                    amount: totalPoints > 0 ? (p.points / totalPoints) * totalCost : 0,
                }));

                allocationMap[dev.id][imp.id] = { salary, fringe, sbc, totalCost, distributions };
                columnTotals[imp.id] += totalCost;
                devTotals[dev.id] += totalCost;
            }
        }

        const grandTotal = Object.values(devTotals).reduce((s, v) => s + v, 0);

        const years = Array.from(new Set(payrollImports.map(p => p.year)));
        const yearLabel = years.length === 1 ? `Total ${years[0]}` : 'Grand Total';

        return NextResponse.json({
            developers: developers.map(d => ({ id: d.id, name: d.name, email: d.email, role: d.role })),
            payrollImports: payrollImports.map(p => ({ id: p.id, label: p.label, payDate: p.payDate, year: p.year })),
            allocationMap,
            columnTotals,
            devTotals,
            grandTotal,
            yearLabel,
            globalFringeRate,
        });
    } catch (error) {
        console.error('Cost allocation error:', error);
        return NextResponse.json({ error: 'Failed to load cost allocation' }, { status: 500 });
    }
}
