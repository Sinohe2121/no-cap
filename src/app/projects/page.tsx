'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderKanban, Ticket, LayoutDashboard, Activity, TrendingUp, DollarSign, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { CHART_SEMANTIC, TOOLTIP_STYLE } from '@/lib/chartColors';
import { usePeriod } from '@/context/PeriodContext';
import {
    BarChart, Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    Cell, ReferenceLine,
} from 'recharts';

interface Project {
    id: string;
    name: string;
    status: string;
}

interface TicketRecord {
    id: string;
    createdAt: string;
    resolutionDate: string | null;
    issueType: string;
    allocatedCost: number;
    storyPoints: number;
    project: { id: string };
    customFields?: Record<string, string>;
}

interface CycleTimeRow {
    label: string;
    count: number;
    cumPct: number;
    color: string;
}

interface StackedChartData {
    label: string;
    Story: number;
    Bug: number;
    Task: number;
    Epic: number;
    Subtask: number;
    [key: string]: any;
}

interface HeatmapData {
    projectId: string;
    projectName: string;
    weekCounts: number[];
}

interface CostPerSPRow {
    name: string;
    costPerSP: number;
    totalCost: number;
    totalSP: number;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
    if (!active || !payload) return null;
    return (
        <div style={{ ...TOOLTIP_STYLE, padding: 12, minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#3F4450', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
            {payload.map((entry, i) => (
                <div key={i} className="flex justify-between items-center gap-4" style={{ fontSize: 12 }}>
                    <span style={{ color: entry.color, fontWeight: 600 }}>{entry.name}</span>
                    <span style={{ color: '#3F4450', fontWeight: 700 }}>{formatCurrency(entry.value)}</span>
                </div>
            ))}
        </div>
    );
};

export default function ProjectsDashboardPage() {
    const [projectCount, setProjectCount] = useState<number | null>(null);
    const [ticketCount, setTicketCount] = useState<number | null>(null);
    const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
    const [stackedData, setStackedData] = useState<StackedChartData[]>([]);
    const [costPerSP, setCostPerSP] = useState<CostPerSPRow[]>([]);
    const [cycleTimeData, setCycleTimeData] = useState<CycleTimeRow[]>([]);
    const [cycleStats, setCycleStats] = useState<{ median: number; p90: number; total: number }>({ median: 0, p90: 0, total: 0 });
    const [loadingCharts, setLoadingCharts] = useState(true);
    const { apiParams } = usePeriod();

    useEffect(() => {
        // Quick metrics
        fetch(`/api/projects?${apiParams}`)
            .then(res => res.json())
            .then(data => setProjectCount(Array.isArray(data) ? data.length : 0))
            .catch(() => setProjectCount(0));
            
        fetch(`/api/tickets?${apiParams}`)
            .then(res => res.json())
            .then(data => setTicketCount(data.tickets ? data.tickets.length : 0))
            .catch(() => setTicketCount(0));

        // Deep analytics fetches
        Promise.all([
            fetch(`/api/projects?${apiParams}`).then(res => res.json()),
            fetch(`/api/tickets?${apiParams}`).then(res => res.json()),
            fetch(`/api/projects/cost-by-type?${apiParams}`).then(res => res.json()),
        ]).then(([projectsRaw, ticketsRaw, costByTypeData]) => {
            const projectsArray: Project[] = Array.isArray(projectsRaw) ? projectsRaw : [];
            const ticketsArray: TicketRecord[] = ticketsRaw.tickets || [];
            
            // Build Heatmap
            const numWeeks = 12;
            const activeProjects = projectsArray.filter(p => p.status !== 'RETIRED');
            const nowTime = new Date().getTime();
            const msPerWeek = 7 * 24 * 60 * 60 * 1000;

            const matrix: HeatmapData[] = activeProjects.map(p => {
                const counts = new Array(numWeeks).fill(0);
                const pTickets = ticketsArray.filter(t => t.project?.id === p.id);
                pTickets.forEach(t => {
                    // Use the actual Jira creation date, not the DB import timestamp
                    const jiraCreated = t.customFields?.['Created'];
                    const tTime = jiraCreated ? new Date(jiraCreated).getTime() : new Date(t.createdAt).getTime();
                    const diffMs = nowTime - tTime;
                    const weekAgo = Math.floor(diffMs / msPerWeek);
                    if (weekAgo >= 0 && weekAgo < numWeeks) {
                        counts[numWeeks - 1 - weekAgo]++; // oldest is index 0
                    }
                });
                return { projectId: p.id, projectName: p.name, weekCounts: counts };
            });

            // Sort by highest activity in the last 12 weeks
            matrix.sort((a, b) => b.weekCounts.reduce((sum, v) => sum + v, 0) - a.weekCounts.reduce((sum, v) => sum + v, 0));
            setHeatmapData(matrix.slice(0, 8)); // Top 8 active projects for space

            // Set stacked chart data from the cost-by-type API
            if (Array.isArray(costByTypeData)) {
                setStackedData(costByTypeData);
            }

            // Cost per Story Point per project
            const projCosts: Record<string, { name: string; cost: number; sp: number }> = {};
            for (const t of ticketsArray) {
                if (!t.project?.id || t.storyPoints <= 0) continue;
                const pid = t.project.id;
                if (!projCosts[pid]) {
                    const proj = projectsArray.find(p => p.id === pid);
                    projCosts[pid] = { name: proj?.name || 'Unknown', cost: 0, sp: 0 };
                }
                projCosts[pid].cost += t.allocatedCost || 0;
                projCosts[pid].sp += t.storyPoints;
            }
            const cpsp = Object.values(projCosts)
                .filter(p => p.sp > 0 && p.cost > 0)
                .map(p => ({ name: p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name, costPerSP: Math.round(p.cost / p.sp), totalCost: Math.round(p.cost), totalSP: Math.round(p.sp) }))
                .sort((a, b) => b.costPerSP - a.costPerSP)
                .slice(0, 10);
            setCostPerSP(cpsp);

            // Sprint Cycle Time Distribution
            const BUCKETS = [
                { label: 'Same day', max: 1, color: '#21944E' },
                { label: '1–2 days', max: 2, color: '#21944E' },
                { label: '3–5 days', max: 5, color: '#4CAF50' },
                { label: '6–10 days', max: 10, color: '#F5A623' },
                { label: '11–14 days', max: 14, color: '#F5A623' },
                { label: '15–21 days', max: 21, color: '#FF7043' },
                { label: '22–30 days', max: 30, color: '#FA4338' },
                { label: '31–60 days', max: 60, color: '#D32F2F' },
                { label: '60+ days', max: Infinity, color: '#B71C1C' },
            ];
            const bucketCounts = BUCKETS.map(() => 0);
            const cycleTimes: number[] = [];

            for (const t of ticketsArray) {
                if (!t.resolutionDate) continue;
                // Use the original Jira creation date from customFields, not the DB import timestamp
                const jiraCreated = (t as any).customFields?.Created;
                const createdStr = jiraCreated || t.createdAt;
                if (!createdStr) continue;
                const created = new Date(createdStr).getTime();
                const resolved = new Date(t.resolutionDate).getTime();
                if (isNaN(created) || isNaN(resolved)) continue;
                const days = Math.abs(resolved - created) / (1000 * 60 * 60 * 24);
                cycleTimes.push(days);
                for (let b = 0; b < BUCKETS.length; b++) {
                    if (days < BUCKETS[b].max) { bucketCounts[b]++; break; }
                }
            }

            const totalResolved = cycleTimes.length;
            let cumulative = 0;
            const ctRows: CycleTimeRow[] = BUCKETS.map((b, i) => {
                cumulative += bucketCounts[i];
                return { label: b.label, count: bucketCounts[i], cumPct: totalResolved > 0 ? Math.round((cumulative / totalResolved) * 100) : 0, color: b.color };
            }).filter(r => r.count > 0 || r.cumPct < 100); // Trim empty trailing buckets

            setCycleTimeData(ctRows);

            // Compute stats
            if (cycleTimes.length > 0) {
                cycleTimes.sort((a, b) => a - b);
                const median = cycleTimes[Math.floor(cycleTimes.length / 2)];
                const p90 = cycleTimes[Math.floor(cycleTimes.length * 0.9)];
                setCycleStats({ median: Math.round(median * 10) / 10, p90: Math.round(p90 * 10) / 10, total: totalResolved });
            }

        }).catch(err => console.error("Error loading charts", err))
        .finally(() => setLoadingCharts(false));

    }, [apiParams]);

    const getHeatmapColor = (count: number) => {
        if (count === 0) return '#EEF0F4';
        if (count <= 1) return '#D3E2EE'; 
        if (count <= 3) return '#A8C5DE'; 
        if (count <= 6) return '#7FA8C8'; 
        return '#4178A2'; 
    };

    return (
        <div className="text-[#3F4450] pb-12">
            
            {/* Header */}
            <div className="flex items-end justify-between mb-8 pb-4 border-b border-[#E2E4E9]/60">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F5F3FF' }}>
                        <LayoutDashboard className="w-6 h-6" style={{ color: '#4141A2' }} />
                    </div>
                    <div>
                        <h1 className="text-[28px] font-black uppercase tracking-tight leading-none mb-1 text-[#3F4450]">Projects & Tickets Hub</h1>
                        <p className="text-[13px] font-semibold text-[#A4A9B6] uppercase tracking-wider">Manage software assets and track engineering metrics</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/projects/list"
                        className="btn-ghost flex items-center gap-2 text-sm font-semibold"
                        style={{ color: '#3F4450' }}
                    >
                        <FolderKanban className="w-4 h-4" style={{ color: '#4141A2' }} />
                        Projects Table
                    </Link>
                    <Link
                        href="/tickets"
                        className="btn-ghost flex items-center gap-2 text-sm font-semibold"
                        style={{ color: '#3F4450' }}
                    >
                        <Ticket className="w-4 h-4" style={{ color: '#4141A2' }} />
                        Tickets Tracker
                    </Link>
                </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <Link href="/projects/list" className="fintech-card p-6 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md" style={{ borderLeft: '4px solid #4141A2' }}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#A4A9B6]">Active Projects Requirement</span>
                        <FolderKanban className="w-4 h-4 text-[#A4A9B6]" />
                    </div>
                    <p className="text-3xl font-black text-[#3F4450] mb-2">{projectCount !== null ? projectCount : '—'}</p>
                    <p className="text-[12px] text-[#717684] font-medium">Tracking lifecycle capitalization windows</p>
                </Link>
                <Link href="/tickets" className="fintech-card p-6 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md" style={{ borderLeft: '4px solid #F5A623' }}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#A4A9B6]">Total Synced Tickets</span>
                        <Ticket className="w-4 h-4 text-[#A4A9B6]" />
                    </div>
                    <p className="text-3xl font-black text-[#3F4450] mb-2">{ticketCount !== null ? ticketCount : '—'}</p>
                    <p className="text-[12px] text-[#717684] font-medium">Synced against external agile boards</p>
                </Link>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                
                {/* Project Activity Heatmap */}
                <div className="fintech-card p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-[12px] font-extrabold text-[#3F4450] tracking-widest uppercase flex items-center gap-2">
                                <Activity className="w-4 h-4 text-[#4141A2]" /> Project Heatmap
                            </h2>
                            <p className="text-[12px] text-[#A4A9B6] mt-1">Ticket volume created over the trailing 12 weeks</p>
                        </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-2.5">
                        {loadingCharts ? (
                            <div className="flex-1 flex items-center justify-center">
                                <span className="text-sm font-semibold text-[#A4A9B6] animate-pulse">Computing Matrix...</span>
                            </div>
                        ) : heatmapData.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-sm font-medium text-[#A4A9B6]">
                                No active project data
                            </div>
                        ) : (
                            <>
                                {/* Week labels (just generic ranges) */}
                                <div className="flex items-center gap-3">
                                    <div className="w-32 flex-shrink-0" />
                                    <div className="flex-1 flex justify-between text-[10px] font-bold text-[#A4A9B6] uppercase tracking-wider relative">
                                        <span>Older</span>
                                        <span>Recent</span>
                                    </div>
                                </div>
                                {/* Rows */}
                                {heatmapData.map((row) => (
                                    <div key={row.projectId} className="flex items-center gap-3">
                                        <div className="text-[12px] font-bold text-[#3F4450] w-32 truncate" title={row.projectName}>
                                            {row.projectName}
                                        </div>
                                        <div className="flex gap-1.5 flex-1">
                                            {row.weekCounts.map((count, i) => (
                                                <div 
                                                    key={i} 
                                                    className="h-6 flex-1 rounded-[3px] transition-colors cursor-pointer hover:ring-1 hover:ring-[#3F4450]"
                                                    style={{ backgroundColor: getHeatmapColor(count) }}
                                                    title={`${count} tickets opened in trailing week ${12 - i}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                    
                    {/* Legend */}
                    <div className="mt-6 flex items-center justify-end gap-2 text-[11px] font-bold text-[#717684]">
                        <span>Low</span>
                        <div className="flex gap-1">
                            {[0, 1, 3, 6, 15].map((v, i) => (
                                <div key={i} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: getHeatmapColor(v) }} />
                            ))}
                        </div>
                        <span>High</span>
                    </div>
                </div>

                {/* Stacked Cost Projection */}
                <div className="fintech-card p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-[12px] font-extrabold text-[#3F4450] tracking-widest uppercase flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-[#F5A623]" /> Cost Projection by Ticket Type
                            </h2>
                            <p className="text-[12px] text-[#A4A9B6] mt-1">Breakdown of allocated payroll by issue classification</p>
                        </div>
                    </div>

                    <div className="flex-1">
                        {loadingCharts ? (
                            <div className="h-full flex items-center justify-center">
                                <span className="text-sm font-semibold text-[#A4A9B6] animate-pulse">Projecting FinTech Charts...</span>
                            </div>
                        ) : stackedData.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-sm font-medium text-[#A4A9B6] h-[280px]">
                                Insufficient data for cost breakdown
                            </div>
                        ) : (
                            <div className="mt-2 -ml-2">
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={stackedData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                        <XAxis 
                                            dataKey="label" 
                                            tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} 
                                            axisLine={false} 
                                            tickLine={false} 
                                            dy={10} 
                                        />
                                        <YAxis 
                                            tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} 
                                            tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} 
                                            axisLine={false} 
                                            tickLine={false} 
                                            dx={-10} 
                                        />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(238, 240, 244, 0.4)' }} />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 16 }} />
                                        
                                        <Bar dataKey="Story" name="Stories" stackId="a" fill={CHART_SEMANTIC.stories} barSize={36} />
                                        <Bar dataKey="Task" name="Tasks" stackId="a" fill={CHART_SEMANTIC.tasks} barSize={36} />
                                        <Bar dataKey="Bug" name="Bugs & Hotfixes" stackId="a" fill={CHART_SEMANTIC.bugs} barSize={36} />
                                        <Bar dataKey="Epic" name="Epic Scaffolding" stackId="a" fill={CHART_SEMANTIC.epics} barSize={36} />
                                        <Bar dataKey="Subtask" name="Subtasks" stackId="a" fill={CHART_SEMANTIC.subtasks} barSize={36} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* Cost Per Story Point Chart */}
            <div className="fintech-card p-6 mb-8">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-[12px] font-extrabold text-[#3F4450] tracking-widest uppercase flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-[#21944E]" /> Cost Per Story Point by Project
                        </h2>
                        <p className="text-[12px] text-[#A4A9B6] mt-1">Compares engineering efficiency across projects — lower $/SP = more cost-effective</p>
                    </div>
                </div>
                {loadingCharts ? (
                    <div className="h-[320px] flex items-center justify-center">
                        <span className="text-sm font-semibold text-[#A4A9B6] animate-pulse">Computing cost metrics...</span>
                    </div>
                ) : costPerSP.length === 0 ? (
                    <div className="h-[320px] flex items-center justify-center text-sm font-medium text-[#A4A9B6]">
                        Insufficient data — ensure tickets have story points and allocated costs
                    </div>
                ) : (
                    <div className="-ml-2">
                        <ResponsiveContainer width="100%" height={Math.max(280, costPerSP.length * 42)}>
                            <BarChart
                                data={costPerSP}
                                layout="vertical"
                                margin={{ top: 5, right: 30, bottom: 5, left: 10 }}
                                barCategoryGap="20%"
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EEF0F4" />
                                <XAxis
                                    type="number"
                                    tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }}
                                    tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: '#3F4450', fontWeight: 600 }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={140}
                                />
                                <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(value: number | undefined, name: string | undefined) => {
                                        const v = value ?? 0;
                                        if (name === 'Cost / SP') return [`$${v.toLocaleString()}`, name];
                                        return [v, name ?? ''];
                                    }}
                                    labelStyle={{ fontWeight: 700, color: '#3F4450', fontSize: 12 }}
                                    cursor={{ fill: 'rgba(238, 240, 244, 0.4)' }}
                                />
                                {costPerSP.length > 1 && (
                                    <ReferenceLine
                                        x={Math.round(costPerSP.reduce((s, r) => s + r.costPerSP, 0) / costPerSP.length)}
                                        stroke="#A4A9B6"
                                        strokeDasharray="4 4"
                                        strokeWidth={1.5}
                                        label={{ value: 'Avg', position: 'top', fill: '#A4A9B6', fontSize: 10, fontWeight: 700 }}
                                    />
                                )}
                                <Bar dataKey="costPerSP" name="Cost / SP" radius={[0, 6, 6, 0]} barSize={24}>
                                    {costPerSP.map((entry, i) => {
                                        const avg = costPerSP.reduce((s, r) => s + r.costPerSP, 0) / costPerSP.length;
                                        const isAboveAvg = entry.costPerSP > avg;
                                        return (
                                            <Cell
                                                key={i}
                                                fill={isAboveAvg ? '#FA4338' : '#21944E'}
                                                fillOpacity={0.8}
                                            />
                                        );
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="mt-3 flex items-center justify-end gap-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: '#21944E', display: 'inline-block' }} /> Below avg (efficient)</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: '#FA4338', display: 'inline-block' }} /> Above avg (costly)</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Sprint Cycle Time Distribution */}
            <div className="fintech-card p-6 mb-8">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-[12px] font-extrabold text-[#3F4450] tracking-widest uppercase flex items-center gap-2">
                            <Clock className="w-4 h-4 text-[#F5A623]" /> Sprint Cycle Time Distribution
                        </h2>
                        <p className="text-[12px] text-[#A4A9B6] mt-1">Days from ticket creation to resolution — how long does work take?</p>
                    </div>
                    {cycleStats.total > 0 && (
                        <div className="flex items-center gap-4 text-[11px]">
                            <div className="text-right">
                                <span className="block font-bold text-[#3F4450]">{cycleStats.median}d</span>
                                <span className="block text-[10px] font-semibold text-[#A4A9B6] uppercase">Median</span>
                            </div>
                            <div className="text-right">
                                <span className="block font-bold text-[#FA4338]">{cycleStats.p90}d</span>
                                <span className="block text-[10px] font-semibold text-[#A4A9B6] uppercase">P90</span>
                            </div>
                            <div className="text-right">
                                <span className="block font-bold text-[#4141A2]">{cycleStats.total}</span>
                                <span className="block text-[10px] font-semibold text-[#A4A9B6] uppercase">Resolved</span>
                            </div>
                        </div>
                    )}
                </div>
                {loadingCharts ? (
                    <div className="h-[300px] flex items-center justify-center">
                        <span className="text-sm font-semibold text-[#A4A9B6] animate-pulse">Computing cycle times...</span>
                    </div>
                ) : cycleTimeData.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-sm font-medium text-[#A4A9B6]">
                        No resolved tickets found — sync tickets with resolution dates
                    </div>
                ) : (
                    <div className="-ml-2">
                        <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={cycleTimeData} margin={{ top: 10, right: 30, bottom: 0, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }}
                                    axisLine={false}
                                    tickLine={false}
                                    dy={10}
                                />
                                <YAxis
                                    yAxisId="left"
                                    tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }}
                                    axisLine={false}
                                    tickLine={false}
                                    dx={-10}
                                    label={{ value: 'Tickets', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }, offset: -5 }}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    domain={[0, 100]}
                                    tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }}
                                    tickFormatter={(v: number) => `${v}%`}
                                    axisLine={false}
                                    tickLine={false}
                                    dx={10}
                                />
                                <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(value: number | undefined, name: string | undefined) => {
                                        const v = value ?? 0;
                                        if (name === 'Cumulative %') return [`${v}%`, name];
                                        return [v, name ?? 'Tickets'];
                                    }}
                                    labelStyle={{ fontWeight: 700, color: '#3F4450', fontSize: 12 }}
                                    cursor={{ fill: 'rgba(238, 240, 244, 0.4)' }}
                                />
                                <Bar yAxisId="left" dataKey="count" name="Tickets" radius={[6, 6, 0, 0]} barSize={38}>
                                    {cycleTimeData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                                    ))}
                                </Bar>
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="cumPct"
                                    name="Cumulative %"
                                    stroke="#3F4450"
                                    strokeWidth={2.5}
                                    dot={{ r: 4, fill: '#3F4450', strokeWidth: 0 }}
                                    activeDot={{ r: 6 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                        <div className="mt-3 flex items-center justify-end gap-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: '#21944E', display: 'inline-block' }} /> Fast (≤5 days)</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: '#F5A623', display: 'inline-block' }} /> Moderate (6–21 days)</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: '#FA4338', display: 'inline-block' }} /> Slow (22+ days)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#3F4450', display: 'inline-block' }} /> Cumulative %</span>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
