export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';

// Provides live table data for embedding in Policy Memos
// ?type=PROJECT_SUMMARY|QRE_SUMMARY|PAYROLL_SUMMARY|AMORT_SCHEDULE&year=2026
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || '';
        const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

        if (type === 'PROJECT_SUMMARY') {
            const projects = await prisma.project.findMany({
                where: { parentProjectId: null },
                include: {
                    tickets: { select: { allocatedAmount: true } },
                    journalEntries: { where: { entryType: 'AMORTIZATION' }, select: { amount: true } },
                },
                orderBy: { name: 'asc' },
            });
            const rows = projects.map(p => {
                const cap = p.tickets.reduce((s, t) => s + (t.allocatedAmount || 0), 0) + p.startingBalance;
                const dep = p.journalEntries.reduce((s, e) => s + e.amount, 0) + p.startingAmortization;
                return {
                    project: p.name,
                    status: p.status,
                    isCapitalizable: p.isCapitalizable,
                    isQRE: (p as any).isQRE ?? false,
                    allocatedAmount: cap,
                    depreciation: dep,
                    netAssetValue: Math.max(0, cap - dep),
                };
            });
            return NextResponse.json({
                type,
                year,
                columns: ['Project', 'Status', 'Capitalizable', 'QRE', 'Capitalized', 'Accumulated Amortization', 'Net Asset Value'],
                rows,
            });
        }

        if (type === 'QRE_SUMMARY') {
            // Reuse form6765 computation logic
            const [fringeConfig] = await Promise.all([
                prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
            ]);
            const globalFringeRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;
            const payrollImports = await prisma.payrollImport.findMany({
                where: { year },
                include: { entries: { include: { developer: { select: { id: true, name: true } } } } },
            });
            const allTickets = await prisma.jiraTicket.findMany({
                include: { project: { select: { isQRE: true } as any } },
            });

            const devQRE: Record<string, { name: string; netCost: number; qreWages: number }> = {};
            for (const imp of payrollImports) {
                const fringeRate: number = (imp as any).fringeBenefitRate ?? globalFringeRate;
                const meetingRate: number = (imp as any).meetingTimeRate ?? 0;
                const pd = new Date(imp.payDate);
                const monthStart = new Date(pd.getFullYear(), pd.getMonth(), 1);
                const monthEnd = new Date(pd.getFullYear(), pd.getMonth() + 1, 0, 23, 59, 59);
                const periodTickets = allTickets.filter(t => {
                    if (t.importPeriod === imp.label) return true;
                    const rd = t.resolutionDate ? new Date(t.resolutionDate) : new Date(t.createdAt);
                    return rd >= monthStart && rd <= monthEnd;
                });
                const devTotalSP: Record<string, number> = {};
                const devQRESP: Record<string, number> = {};
                for (const t of periodTickets) {
                    if (!t.assigneeId) continue;
                    devTotalSP[t.assigneeId] = (devTotalSP[t.assigneeId] || 0) + t.storyPoints;
                    const isQRE = (t as any).isQRE ?? (t as any).project?.isQRE ?? false;
                    if (isQRE) devQRESP[t.assigneeId] = (devQRESP[t.assigneeId] || 0) + t.storyPoints;
                }
                for (const entry of imp.entries) {
                    const dev = entry.developer;
                    const net = (entry.grossSalary * (1 + fringeRate) + ((entry as any).sbcAmount ?? 0)) * (1 - meetingRate);
                    const totalSP = devTotalSP[dev.id] || 0;
                    const qreWages = totalSP > 0 ? net * ((devQRESP[dev.id] || 0) / totalSP) : 0;
                    if (!devQRE[dev.id]) devQRE[dev.id] = { name: dev.name, netCost: 0, qreWages: 0 };
                    devQRE[dev.id].netCost += net;
                    devQRE[dev.id].qreWages += qreWages;
                }
            }
            const rows = Object.values(devQRE).sort((a, b) => b.qreWages - a.qreWages).map(d => ({
                developer: d.name.split(',').reverse().join(' ').trim(),
                netCost: d.netCost,
                qreWages: d.qreWages,
                qrePct: d.netCost > 0 ? d.qreWages / d.netCost : 0,
            }));
            const totalQREWages = rows.reduce((s, r) => s + r.qreWages, 0);
            const contractors = await (prisma as any).contractResearch.findMany({ where: { year } });
            const contractQRE = contractors.reduce((s: number, c: any) => s + c.amount * c.qrePct, 0);
            return NextResponse.json({
                type, year,
                columns: ['Developer', 'Net Allocated Cost', 'QRE Wages', 'QRE %'],
                rows,
                summary: { totalQREWages, contractQRE, totalQRE: totalQREWages + contractQRE },
            });
        }

        if (type === 'PAYROLL_SUMMARY') {
            const imports = await prisma.payrollImport.findMany({
                where: { year },
                orderBy: { payDate: 'asc' },
                include: { entries: { select: { grossSalary: true, sbcAmount: true } } },
            });
            const rows = imports.map(imp => {
                const totalGross = imp.entries.reduce((s, e) => s + e.grossSalary, 0);
                const totalSBC = imp.entries.reduce((s, e) => s + ((e as any).sbcAmount || 0), 0);
                const fringeRate: number = (imp as any).fringeBenefitRate ?? 0.25;
                const meetingRate: number = (imp as any).meetingTimeRate ?? 0;
                const fringe = totalGross * fringeRate;
                const loaded = totalGross + fringe + totalSBC;
                const net = loaded * (1 - meetingRate);
                return { period: imp.label, totalGross, fringe, sbc: totalSBC, loaded, meetingAdj: loaded * meetingRate, netCost: net };
            });
            return NextResponse.json({
                type, year,
                columns: ['Period', 'Gross Wages', 'Fringe Benefits', 'SBC', 'Loaded Cost', 'Meeting Adj.', 'Net Allocated Cost'],
                rows,
            });
        }

        if (type === 'AMORT_SCHEDULE') {
            const journalEntries = await prisma.journalEntry.findMany({
                where: { entryType: 'AMORTIZATION', period: { is: { year } } },
                include: { project: { select: { name: true } }, period: { select: { month: true, year: true } } },
                orderBy: [{ period: { month: 'asc' } }, { project: { name: 'asc' } }],
            });
            const rows = journalEntries.filter(e => e.project !== null).map(e => ({
                project: e.project!.name,
                month: e.period.month,
                year: e.period.year,
                charge: e.amount,
            }));
            return NextResponse.json({ type, year, columns: ['Project', 'Month', 'Year', 'Amortization Charge'], rows });
        }

        return NextResponse.json({ error: 'Unknown type. Use PROJECT_SUMMARY, QRE_SUMMARY, PAYROLL_SUMMARY, or AMORT_SCHEDULE' }, { status: 400 });
    } catch (error) {
        return handleApiError(error, 'Failed to load live data');
    }
}
