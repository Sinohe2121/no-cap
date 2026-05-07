export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeLoadedCost } from '@/lib/costUtils';
import { isTicketActiveInPeriod, getQualifyingPeriodLabels } from '@/lib/periodTickets';

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
        // Skip months that don't ALSO have a Jira import — a payroll-only
        // month produces phantom "April" cost numbers when no tickets have
        // been imported for April yet.
        const qualifyingPeriods = await getQualifyingPeriodLabels();
        const payrollImportsRaw: PayrollImportRow[] = await prisma.payrollImport.findMany({
            orderBy: { payDate: 'asc' },
            include: {
                entries: { select: { developerId: true, grossSalary: true } },
            },
        });
        const payrollImports = payrollImportsRaw.filter(p => qualifyingPeriods.has(p.label));

        // ── 4. Load all tickets with project info for distribution ───
        const allTickets = await prisma.jiraTicket.findMany({
            where: { assigneeId: { in: developers.map(d => d.id) } },
            select: {
                assigneeId: true,
                projectId: true,
                storyPoints: true,
                resolutionDate: true,
                importPeriod: true,
                project: { select: { id: true, name: true } },
            },
        });

        // ── 4a. Pre-bucket tickets by assignee ───────────────────────────
        // We can't pre-key by (importPeriod, assignee) anymore: a ticket
        // first imported in February with importPeriod="February 2026" is
        // ALSO active in March, April, ... until it resolves, so the same
        // ticket needs to surface in multiple periods. Bucket by assignee
        // only and let the inner loop apply the active-in-period predicate.
        type DevTicket = (typeof allTickets)[number];
        const ticketsByDev = new Map<string, DevTicket[]>();
        for (const t of allTickets) {
            if (!t.assigneeId || !t.importPeriod) continue;
            const arr = ticketsByDev.get(t.assigneeId);
            if (arr) arr.push(t);
            else ticketsByDev.set(t.assigneeId, [t]);
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

            for (const dev of developers) {
                const salary = salaryByDev[dev.id] || 0;
                const fringeRate = dev.fringeBenefitRate || globalFringeRate;
                const fringe = salary * fringeRate;
                const sbc = dev.stockCompAllocation;
                const totalCost = computeLoadedCost(salary, fringeRate, sbc);

                // Tickets active in this period: imported on or before, and
                // not resolved before the period started. Includes carry-forwards.
                const devAllTickets = ticketsByDev.get(dev.id) ?? [];
                const devTickets = devAllTickets.filter(t => isTicketActiveInPeriod(t, imp.label));

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
