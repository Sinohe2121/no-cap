'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Users, FileSpreadsheet, ArrowRight, Activity, ChevronDown } from 'lucide-react';
import { usePeriod } from '@/context/PeriodContext';
import { Card } from '@/components/ui/Card';
import { DONUT_COLORS, TOOLTIP_STYLE } from '@/lib/chartColors';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface Developer {
    id: string;
    name: string;
    loadedCost: number;
    periodCost?: number;
    ticketCount: number;
    isActive?: boolean;
}

interface VelocityRow {
    devId: string;
    devName: string;
    weeklyPoints: number[];
    totalSP: number;
    trend: 'up' | 'down' | 'flat';
    ticketsResolved: number;
    avgCycleTime: number;
    capRatio: number;
    loadedCost: number;
    role: string;
}

interface GridDataPoint {
    label: string;
    timestamp: number;
    ticketCount: number;
    allocatedCost: number;
    avgCost: number;
    variance: number;
    headcount: number;
}

function formatShortCurrency(amount: number) {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount.toFixed(0)}`;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
    if (!active || !payload) return null;
    return (
        <div style={{ ...TOOLTIP_STYLE, padding: 10, minWidth: 140, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#A4A9B6', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
            {payload.map((entry, i) => (
                <div key={i} className="flex justify-between items-center gap-4" style={{ fontSize: 13 }}>
                    <span style={{ color: entry.color, fontWeight: 600 }}>{entry.name}</span>
                    <span style={{ color: '#3F4450', fontWeight: 800 }}>
                        {(() => {
                            const n = entry.name.toLowerCase();
                            if (n.includes('variance')) return `${entry.value.toFixed(1)}%`;
                            if (n.includes('count') || n.includes('headcount')) return Math.round(entry.value);
                            return formatShortCurrency(entry.value);
                        })()}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default function DevelopersDashboardPage() {
    const [developers, setDevelopers] = useState<Developer[]>([]);
    const [gridData, setGridData] = useState<GridDataPoint[]>([]);
    const [donutData, setDonutData] = useState<{name: string, value: number}[]>([]);
    const [velocityData, setVelocityData] = useState<VelocityRow[]>([]);
    const [expandedDevId, setExpandedDevId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const { apiParams, range, preset } = usePeriod();

    useEffect(() => {
        setLoading(true);

        // Build extended params that include one month prior so M/M variance has a baseline
        // and the chart correctly shows the prior month's data
        // Use component-based constructor to avoid timezone issues with ISO date strings
        const rangeStartParsed = new Date(range.start);
        const startYear = rangeStartParsed.getFullYear();
        const startMonth = rangeStartParsed.getMonth(); // already 0-indexed
        const extendedStart = new Date(startYear, startMonth - 1, 1);
        const rangeEndParsed = new Date(range.end);
        const endDateStr = `${rangeEndParsed.getFullYear()}-${String(rangeEndParsed.getMonth() + 1).padStart(2, '0')}-${String(rangeEndParsed.getDate()).padStart(2, '0')}`;
        const startDateStr = `${extendedStart.getFullYear()}-${String(extendedStart.getMonth() + 1).padStart(2, '0')}-01`;
        const extendedParams = new URLSearchParams({
            start: startDateStr,
            end: endDateStr,
            startDate: startDateStr,
            endDate: endDateStr,
        }).toString();

        Promise.all([
            fetch(`/api/developers?${apiParams}`).then((res) => res.json()),
            fetch(`/api/tickets?${extendedParams}`).then((res) => res.json()),
            fetch(`/api/projects/cost-by-type?${extendedParams}`).then((res) => res.json()),
        ])
        .then(([devRaw, ticRaw, costByType]) => {
            const devs: Developer[] = Array.isArray(devRaw) ? devRaw : [];
            const ticks = ticRaw.tickets ? ticRaw.tickets : [];
            setDevelopers(devs);

            // Build a lookup of monthly total costs from payroll distribution
            // costByType returns: [{ label: "Feb 2026", Story: $, Bug: $, ... }]
            const monthlyCostLookup: Record<string, number> = {};
            let totalCapex = 0;
            let totalOpex = 0;
            if (Array.isArray(costByType)) {
                for (const entry of costByType) {
                    // Sum all ticket types for total month cost
                    const monthTotal = (entry.Story || 0) + (entry.Bug || 0) + (entry.Task || 0) + (entry.Epic || 0) + (entry.Subtask || 0);
                    // Convert "Feb 2026" to "Feb 26" format to match gridData labels
                    const parts = entry.label.split(' ');
                    const shortLabel = parts.length === 2 ? `${parts[0]} ${parts[1].slice(2)}` : entry.label;
                    monthlyCostLookup[entry.label] = monthTotal;
                    monthlyCostLookup[shortLabel] = monthTotal;
                    // CapEx = Story cost on capitalizable projects, OpEx = everything else
                    totalCapex += (entry.Story || 0);
                    totalOpex += (entry.Bug || 0) + (entry.Task || 0) + (entry.Epic || 0) + (entry.Subtask || 0);
                }
            }

            // Prior month data is now included in the single extended cost-by-type call

            // Use component-based constructor to avoid timezone issues
            // (new Date('2026-02-01') parses to Jan 31 in PST)
            const rangeStartDate = new Date(range.start);
            let actualStart = new Date(rangeStartDate.getFullYear(), rangeStartDate.getMonth(), 1);
            // Include one month prior for M/M variance calculation
            actualStart = new Date(actualStart.getFullYear(), actualStart.getMonth() - 1, 1);
            const rangeEndDate = new Date(range.end);
            const actualEnd = new Date(rangeEndDate.getFullYear(), rangeEndDate.getMonth(), 1);
            
            // If the user selects "All Time", dynamically snap the X-axis origin to the first ticket 
            // instead of plotting flat zeros back to year 2000.
            if (preset === 'all_time' && ticks.length > 0) {
                const earliest = ticks.reduce((min: number, t: any) => {
                    const jiraDate = t.customFields?.Created;
                    const d = new Date(jiraDate || t.createdAt).getTime();
                    return d < min ? d : min;
                }, actualEnd.getTime());
                actualStart = new Date(earliest);
            } else if (preset === 'all_time' && ticks.length === 0) {
                actualStart = new Date(actualEnd);
                actualStart.setMonth(actualStart.getMonth() - 5);
            }
            
            actualStart.setDate(1); 
            actualStart.setHours(0,0,0,0);
            
            const monthsMap: Record<string, GridDataPoint> = {};
            const cursor = new Date(actualStart);
            
            // Traverse from `actualStart` to current boundary month, spanning explicitly
            let loopSafety = 0;
            while ((cursor <= actualEnd || (cursor.getFullYear() === actualEnd.getFullYear() && cursor.getMonth() === actualEnd.getMonth())) && loopSafety < 120) {
                const ml = cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                monthsMap[ml] = { 
                    label: ml, 
                    timestamp: cursor.getTime(), 
                    ticketCount: 0, 
                    allocatedCost: monthlyCostLookup[ml] || 0, 
                    avgCost: 0, 
                    variance: 0, 
                    headcount: 0 
                };
                cursor.setMonth(cursor.getMonth() + 1);
                loopSafety++;
            }

            // Track unique assignees per month for headcount
            // AND accumulate ticket-level allocatedCost as fallback when payroll data is missing
            const monthAssignees: Record<string, Set<string>> = {};
            const ticketCostPerMonth: Record<string, number> = {};
            ticks.forEach((t: any) => {
                // Use the original Jira creation date, not the DB import timestamp
                const jiraCreated = t.customFields?.Created;
                const dateStr = jiraCreated || t.createdAt;
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return;
                const ml = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                if (monthsMap[ml]) {
                    monthsMap[ml].ticketCount++;
                    const assigneeId = typeof t.assignee === 'object' ? t.assignee?.id : t.assigneeId;
                    if (assigneeId) {
                        if (!monthAssignees[ml]) monthAssignees[ml] = new Set();
                        monthAssignees[ml].add(assigneeId);
                    }
                    // Accumulate ticket-level allocatedCost per month
                    if (t.allocatedCost > 0) {
                        ticketCostPerMonth[ml] = (ticketCostPerMonth[ml] || 0) + t.allocatedCost;
                    }
                }
            });

            // Set headcount per month from unique assignees
            // Also fill in allocatedCost from ticket data when payroll cost is missing
            for (const [ml, assigneeSet] of Object.entries(monthAssignees)) {
                if (monthsMap[ml]) {
                    monthsMap[ml].headcount = assigneeSet.size;
                }
            }
            for (const [ml, cost] of Object.entries(ticketCostPerMonth)) {
                if (monthsMap[ml] && monthsMap[ml].allocatedCost === 0) {
                    monthsMap[ml].allocatedCost = cost;
                }
            }

            // Sort chronologically 
            let chartArray = Object.values(monthsMap).sort((a,b) => a.timestamp - b.timestamp);

            // If completely empty array bounds mapping, inject flat zero to prevent Recharts collapse
            if (chartArray.length === 0) {
                const now = new Date();
                chartArray = [{ label: now.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), timestamp: now.getTime(), ticketCount: 0, allocatedCost: 0, avgCost: 0, variance: 0, headcount: devs.length }];
            }

            // Calculations
            chartArray.forEach((m, i) => {
                m.avgCost = m.ticketCount > 0 ? (m.allocatedCost / m.ticketCount) : 0;
                if (i === 0) {
                    m.variance = 0;
                } else {
                    const prev = chartArray[i-1].allocatedCost;
                    m.variance = prev > 0 ? ((m.allocatedCost - prev) / prev) * 100 : 0;
                }
            });

            setGridData(chartArray);

            // Donut CapEx/OpEx Ratio — use payroll-derived totals
            if (totalCapex === 0 && totalOpex === 0) {
                totalOpex = 1; // Failsafe for empty data
            }

            setDonutData([
                { name: 'CapEx', value: totalCapex },
                { name: 'OpEx', value: totalOpex < 0 ? 0 : totalOpex }
            ]);

            // ── Developer Velocity Sparklines (8-week) ──
            const numWeeks = 8;
            const nowMs = Date.now();
            const msPerWeek = 7 * 24 * 60 * 60 * 1000;

            const velocityRows: VelocityRow[] = devs
                .filter(d => d.isActive !== false)
                .map(d => {
                    const devTicks = ticks.filter((t: any) => {
                        const assignee = t.assignee || t.assigneeId;
                        if (typeof assignee === 'object' && assignee?.id) return assignee.id === d.id;
                        return assignee === d.id;
                    });

                    const weekly = new Array(numWeeks).fill(0);
                    for (const t of devTicks) {
                        const resolved = t.resolutionDate ? new Date(t.resolutionDate).getTime() : null;
                        const created = new Date(t.createdAt).getTime();
                        const tMs = resolved || created;
                        const weeksAgo = Math.floor((nowMs - tMs) / msPerWeek);
                        if (weeksAgo >= 0 && weeksAgo < numWeeks) {
                            weekly[numWeeks - 1 - weeksAgo] += (t.storyPoints || 0);
                        }
                    }

                    const totalSP = weekly.reduce((a, b) => a + b, 0);
                    const firstHalf = weekly.slice(0, 4).reduce((a, b) => a + b, 0);
                    const secondHalf = weekly.slice(4).reduce((a, b) => a + b, 0);
                    const trend: 'up' | 'down' | 'flat' = secondHalf > firstHalf * 1.15 ? 'up' : secondHalf < firstHalf * 0.85 ? 'down' : 'flat';

                    // Per-developer scorecard metrics
                    const resolved = devTicks.filter((t: any) => t.resolutionDate);
                    const ticketsResolved = resolved.length;
                    const cycleTimes = resolved.map((t: any) => {
                        const jiraCreated = t.customFields?.Created;
                        const c = new Date(jiraCreated || t.createdAt).getTime();
                        const r = new Date(t.resolutionDate).getTime();
                        return Math.max(0, (r - c) / (1000 * 60 * 60 * 24));
                    }).filter((d: number) => d > 0 && d < 365);
                    const avgCycleTime = cycleTimes.length > 0
                        ? Math.round((cycleTimes.reduce((a: number, b: number) => a + b, 0) / cycleTimes.length) * 10) / 10
                        : 0;

                    const capTickets = devTicks.filter((t: any) => {
                        const proj = t.project;
                        return proj?.isCapitalizable && t.issueType === 'STORY';
                    }).length;
                    const capRatio = devTicks.length > 0 ? Math.round((capTickets / devTicks.length) * 100) : 0;
                    const loadedCost = (d as any).loadedCost || (d as any).periodCost || 0;
                    const role = (d as any).role || 'ENG';

                    return { devId: d.id, devName: d.name || 'Unknown', weeklyPoints: weekly, totalSP, trend, ticketsResolved, avgCycleTime, capRatio, loadedCost, role };
                })
                .filter(v => v.totalSP > 0)
                .sort((a, b) => b.totalSP - a.totalSP);

            setVelocityData(velocityRows);

        })
        .finally(() => setLoading(false));
    }, [apiParams]);

    // Derived KPI Headers
    const latestAvgCost = gridData.length > 0 ? gridData[gridData.length - 1].avgCost : 0;
    const latestVariance = gridData.length > 0 ? gridData[gridData.length - 1].variance : 0;
    const currentHeadcount = developers.filter(d => d.isActive !== false).length;
    const capexCap = donutData.length > 0 ? donutData[0].value : 0;
    const opexCap = donutData.length > 0 ? donutData[1].value : 0;
    const capexRatio = capexCap + opexCap > 0 ? Math.round((capexCap / (capexCap + opexCap)) * 100) : 0;

    // DONUT_COLORS imported from @/lib/chartColors

    if (loading) {
        return (
            <div className="flex flex-col flex-1 items-center justify-center p-20">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
                <span className="text-xs font-bold text-[#A4A9B6] uppercase tracking-widest mt-4">Synthesizing Hub...</span>
            </div>
        );
    }

    return (
        <div className="text-[#3F4450] pb-12">
            
            <div className="flex items-start justify-between mb-8 pb-4 border-b border-[#E2E4E9]/60">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#FFF3E0' }}>
                        <Users className="w-6 h-6" style={{ color: '#F5A623' }} />
                    </div>
                    <div>
                        <h1 className="text-[28px] font-black uppercase tracking-tight leading-none mb-1 text-[#3F4450]">FTE & Payroll Summary</h1>
                        <p className="text-[13px] font-semibold text-[#A4A9B6] uppercase tracking-wider">Capitalized developer compensation and allocation metrics</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 pt-2 flex-wrap">
                    <Link href="/developers/roster" className="btn-ghost text-xs">
                        <Users className="w-4 h-4" /> Payroll Roster
                    </Link>
                    <Link href="/developers/payroll-register" className="btn-ghost text-xs">
                        <FileSpreadsheet className="w-4 h-4" /> Payroll Register
                    </Link>
                    <Link href="/developers/cost-allocation" className="btn-accent text-xs">
                        Total Cost Allocation
                    </Link>
                </div>
            </div>

            {/* 2x2 Unified Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                
                {/* 1. Avg Cost per Ticket */}
                <div className="fintech-card p-6 flex flex-col justify-between" style={{ minHeight: '260px' }}>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-[12px] font-extrabold text-[#717684] tracking-widest uppercase mb-2">Average Cost per Ticket</h3>
                            <div className="flex items-end gap-3">
                                <span className="text-[32px] font-black text-[#3F4450] leading-none">{formatShortCurrency(latestAvgCost)}</span>
                                <span className="text-[12px] font-bold text-[#A4A9B6] uppercase tracking-wider mb-1">Per Issue</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 mt-2 -ml-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={gridData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} axisLine={false} tickLine={false} dy={8} />
                                <YAxis tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} tickFormatter={(v) => formatShortCurrency(v)} axisLine={false} tickLine={false} dx={-10} width={45} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(238, 240, 244, 0.4)' }} />
                                <Bar dataKey="avgCost" name="Avg Cost" fill="#4141A2" barSize={32} radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Capex/Opex Ratio */}
                <div className="fintech-card p-6 flex flex-col justify-between" style={{ minHeight: '260px' }}>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div>
                            <h3 className="text-[12px] font-extrabold text-[#717684] tracking-widest uppercase mb-2">Capex/Opex Ratio</h3>
                            <div className="flex items-end gap-3">
                                <span className="text-[32px] font-black text-[#3F4450] leading-none">{capexRatio}% / {100 - capexRatio}%</span>
                                <span className="text-[12px] font-bold text-[#A4A9B6] uppercase tracking-wider mb-1">Capitalized</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 relative mt-2">
                        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
                            <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                                <Pie 
                                   data={donutData} cx="50%" cy="50%" 
                                   innerRadius={50} outerRadius={70} 
                                   paddingAngle={3} dataKey="value" stroke="none"
                                >
                                    {donutData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-[28px] font-black text-[#4141A2] leading-none -ml-1">{capexRatio}%</span>
                            <span className="text-[11px] font-extrabold text-[#A4A9B6] uppercase tracking-wider mt-1">Capex</span>
                        </div>
                    </div>
                </div>

                {/* 3. Month-over-Month Variance */}
                <div className="fintech-card p-6 flex flex-col justify-between" style={{ minHeight: '260px' }}>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-[12px] font-extrabold text-[#717684] tracking-widest uppercase mb-2">Month-over-Month Variance</h3>
                            <div className="flex items-end gap-3">
                                <span className="text-[32px] font-black text-[#3F4450] leading-none">{latestVariance > 0 ? '+' : ''}{latestVariance.toFixed(1)}%</span>
                                <span className="text-[12px] font-bold text-[#A4A9B6] uppercase tracking-wider mb-1">vs Prior</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 mt-2 -ml-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={gridData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} axisLine={false} tickLine={false} dy={8} />
                                <YAxis tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} dx={-10} width={45} />
                                <ReferenceLine y={0} stroke="#A4A9B6" strokeDasharray="3 3" />
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(238, 240, 244, 1)', strokeWidth: 2 }} />
                                <Line type="monotone" dataKey="variance" name="MoM Variance" stroke="#FA4338" strokeWidth={3} dot={{ r: 4, fill: '#FA4338', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 4. Active Headcount */}
                <div className="fintech-card p-6 flex flex-col justify-between" style={{ minHeight: '260px' }}>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-[12px] font-extrabold text-[#717684] tracking-widest uppercase mb-2">Active Headcount</h3>
                            <div className="flex items-end gap-3">
                                <span className="text-[32px] font-black text-[#3F4450] leading-none">{currentHeadcount}</span>
                                <span className="text-[12px] font-bold text-[#A4A9B6] uppercase tracking-wider mb-1">Total FTEs</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 mt-2 -ml-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={gridData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} axisLine={false} tickLine={false} dy={8} />
                                <YAxis tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} axisLine={false} tickLine={false} dx={-10} width={45} />
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(238, 240, 244, 1)', strokeWidth: 2 }} />
                                <Line type="monotone" dataKey="headcount" name="Headcount" stroke="#21944E" strokeWidth={3} dot={{ r: 4, fill: '#21944E', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* Developer Velocity Sparklines with Expandable Scorecards */}
            {velocityData.length > 0 && (() => {
                const maxSP = Math.max(...velocityData.map(r => Math.max(...r.weeklyPoints)), 1);
                // Team composition for the donut
                const roleMap: Record<string, number> = {};
                for (const v of velocityData) {
                    const label = v.role === 'ENG' ? 'Engineering' : v.role === 'PRODUCT' ? 'Product' : v.role === 'DESIGN' ? 'Design' : v.role || 'Other';
                    roleMap[label] = (roleMap[label] || 0) + 1;
                }
                const teamDonut = Object.entries(roleMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
                const TEAM_COLORS = ['#4141A2', '#21944E', '#F5A623', '#FA4338', '#717684'];
                const avgSP = velocityData.length > 0 ? Math.round((velocityData.reduce((s, v) => s + v.totalSP, 0) / velocityData.length) * 10) / 10 : 0;
                const topPerformer = velocityData[0]?.devName || '—';

                return (
                    <div className="fintech-card p-6 mb-8">
                        <div className="flex justify-between items-center mb-5">
                            <div>
                                <h2 className="text-[12px] font-extrabold text-[#3F4450] tracking-widest uppercase flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-[#4141A2]" /> Developer Velocity
                                </h2>
                                <p className="text-[12px] text-[#A4A9B6] mt-1">Story points resolved per week — trailing 8-week trend · click to expand</p>
                            </div>
                        </div>

                        <div className="flex gap-6">
                            {/* Left: Velocity List */}
                            <div className="flex-1 min-w-0">
                                {velocityData.map((v, idx) => {
                                    const formattedSP = Number.isInteger(v.totalSP) ? v.totalSP : Math.round(v.totalSP * 10) / 10;
                                    const isExpanded = expandedDevId === v.devId;

                                    return (
                                        <div key={v.devId}>
                                            <div
                                                className="flex items-center gap-4 px-4 py-3 transition-all cursor-pointer"
                                                style={{
                                                    background: isExpanded ? '#F0EEFF' : idx % 2 === 0 ? '#FAFBFC' : 'transparent',
                                                    borderRadius: isExpanded ? '8px 8px 0 0' : 8,
                                                }}
                                                onClick={() => setExpandedDevId(isExpanded ? null : v.devId)}
                                            >
                                                {/* Expand chevron */}
                                                <ChevronDown
                                                    className="w-3.5 h-3.5 transition-transform flex-shrink-0"
                                                    style={{
                                                        color: '#A4A9B6',
                                                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                    }}
                                                />

                                                {/* Name */}
                                                <Link
                                                    href={`/developers/${v.devId}`}
                                                    className="w-40 text-[13px] font-semibold no-underline truncate"
                                                    style={{ color: '#3F4450' }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {v.devName}
                                                </Link>

                                                {/* Sparkline */}
                                                <div className="flex-1" style={{ maxWidth: 200 }}>
                                                    <div className="flex items-end gap-1" style={{ height: 28 }}>
                                                        {v.weeklyPoints.map((sp, i) => (
                                                            <div
                                                                key={i}
                                                                className="flex-1 rounded-sm transition-all"
                                                                style={{
                                                                    height: maxSP > 0 ? Math.max(3, (sp / maxSP) * 28) : 3,
                                                                    background: sp > 0
                                                                        ? `rgba(65, 65, 162, ${0.3 + (sp / maxSP) * 0.7})`
                                                                        : '#EEF0F4',
                                                                    minWidth: 6,
                                                                }}
                                                                title={`Week ${i + 1}: ${sp} SP`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Total SP */}
                                                <div className="w-20 text-right tabular-nums">
                                                    <span className="text-[14px] font-bold" style={{ color: '#3F4450' }}>{formattedSP}</span>
                                                    <span className="text-[10px] font-semibold ml-1" style={{ color: '#A4A9B6' }}>SP</span>
                                                </div>

                                                {/* Trend */}
                                                <div className="w-8 flex justify-center">
                                                    {v.trend === 'up' && <ArrowRight className="w-3.5 h-3.5 -rotate-45" style={{ color: '#21944E' }} />}
                                                    {v.trend === 'down' && <ArrowRight className="w-3.5 h-3.5 rotate-45" style={{ color: '#FA4338' }} />}
                                                    {v.trend === 'flat' && <ArrowRight className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} />}
                                                </div>
                                            </div>

                                            {/* Expanded Scorecard */}
                                            {isExpanded && (
                                                <div
                                                    className="px-4 pb-4 pt-2 flex items-center gap-6"
                                                    style={{
                                                        background: '#F8F7FF',
                                                        borderRadius: '0 0 8px 8px',
                                                        borderTop: '1px solid #E8E6F5',
                                                    }}
                                                >
                                                    {/* Initials Avatar */}
                                                    <div
                                                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                                        style={{ background: '#4141A2', color: '#fff', fontSize: 14, fontWeight: 800, letterSpacing: '0.03em' }}
                                                    >
                                                        {v.devName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>

                                                    {/* Role Badge */}
                                                    <div className="flex flex-col gap-1 flex-shrink-0">
                                                        <span className="text-[13px] font-bold" style={{ color: '#3F4450' }}>{v.devName}</span>
                                                        <span
                                                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full w-fit"
                                                            style={{ background: '#E8E6F5', color: '#4141A2' }}
                                                        >
                                                            {v.role}
                                                        </span>
                                                    </div>

                                                    {/* Cap Ratio Ring */}
                                                    <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 64 }}>
                                                        <svg width="48" height="48" viewBox="0 0 48 48">
                                                            <circle cx="24" cy="24" r="18" fill="none" stroke="#EEF0F4" strokeWidth="5" />
                                                            <circle
                                                                cx="24" cy="24" r="18" fill="none"
                                                                stroke="#4141A2" strokeWidth="5"
                                                                strokeDasharray={`${(v.capRatio / 100) * 113.1} 113.1`}
                                                                strokeLinecap="round"
                                                                transform="rotate(-90 24 24)"
                                                            />
                                                            <text x="24" y="26" textAnchor="middle" fontSize="11" fontWeight="800" fill="#3F4450">
                                                                {v.capRatio}%
                                                            </text>
                                                        </svg>
                                                        <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: '#A4A9B6' }}>Cap</span>
                                                    </div>

                                                    {/* Metric Pills */}
                                                    <div className="flex gap-3 flex-1">
                                                        <div className="flex flex-col items-center px-4 py-2 rounded-lg" style={{ background: '#fff', border: '1px solid #EEF0F4' }}>
                                                            <span className="text-[16px] font-black" style={{ color: '#3F4450' }}>{v.ticketsResolved}</span>
                                                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Tickets</span>
                                                        </div>
                                                        <div className="flex flex-col items-center px-4 py-2 rounded-lg" style={{ background: '#fff', border: '1px solid #EEF0F4' }}>
                                                            <span className="text-[16px] font-black" style={{ color: '#3F4450' }}>{v.avgCycleTime > 0 ? `${v.avgCycleTime}d` : '—'}</span>
                                                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Avg Cycle</span>
                                                        </div>
                                                        <div className="flex flex-col items-center px-4 py-2 rounded-lg" style={{ background: '#fff', border: '1px solid #EEF0F4' }}>
                                                            <span className="text-[16px] font-black" style={{ color: '#3F4450' }}>{v.loadedCost > 0 ? formatShortCurrency(v.loadedCost) : '—'}</span>
                                                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Loaded Cost</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Right: Team Composition Donut */}
                            <div className="flex flex-col items-center justify-start flex-shrink-0" style={{ width: 200 }}>
                                <h3 className="text-[10px] font-extrabold text-[#A4A9B6] tracking-widest uppercase mb-3">Team Composition</h3>
                                <ResponsiveContainer width={160} height={160}>
                                    <PieChart>
                                        <Pie
                                            data={teamDonut}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%" cy="50%"
                                            innerRadius={45}
                                            outerRadius={70}
                                            strokeWidth={2}
                                            stroke="#fff"
                                        >
                                            {teamDonut.map((_, i) => (
                                                <Cell key={i} fill={TEAM_COLORS[i % TEAM_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ ...TOOLTIP_STYLE, padding: 8, fontSize: 11 }}
                                            formatter={(value: number | undefined) => [value ?? 0, 'Devs']}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="text-center -mt-2 mb-3">
                                    <span className="text-[22px] font-black" style={{ color: '#3F4450' }}>{velocityData.length}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: '#A4A9B6' }}>Active Devs</span>
                                </div>
                                {/* Legend */}
                                <div className="flex flex-col gap-1.5 w-full px-2">
                                    {teamDonut.map((entry, i) => (
                                        <div key={entry.name} className="flex items-center justify-between text-[11px]">
                                            <span className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }} />
                                                <span className="font-semibold" style={{ color: '#3F4450' }}>{entry.name}</span>
                                            </span>
                                            <span className="font-bold" style={{ color: '#717684' }}>{entry.value}</span>
                                        </div>
                                    ))}
                                </div>
                                {/* Summary Stats */}
                                <div className="mt-4 pt-3 border-t border-[#EEF0F4] w-full flex flex-col gap-2 px-2">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Avg SP/Dev</span>
                                        <span className="font-black" style={{ color: '#3F4450' }}>{avgSP}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                        <span className="font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Top Performer</span>
                                        <span className="font-black truncate ml-2" style={{ color: '#4141A2', maxWidth: 80 }}>{topPerformer.split(',')[0]}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-[#F0F0F5] flex items-center justify-between">
                            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>
                                <span>Older ← → Recent</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>
                                <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3 -rotate-45" style={{ color: '#21944E' }} /> Accelerating</span>
                                <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3 rotate-45" style={{ color: '#FA4338' }} /> Decelerating</span>
                                <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3" style={{ color: '#A4A9B6' }} /> Steady</span>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
}
