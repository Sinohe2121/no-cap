'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { DollarSign, TrendingDown, Users, FolderKanban, AlertTriangle, ArrowRight, Activity, BarChart2, PieChart } from 'lucide-react';
import { usePeriod } from '@/context/PeriodContext';
import { Badge } from '@/components/ui/Badge';
import { GEM_SHADES, TOOLTIP_STYLE } from '@/lib/chartColors';

interface DashboardData {
    summary: {
        totalAssetValue: number;
        totalExpensed: number;
        totalBugCost: number;
        ytdAmortization: number;
        activeDeveloperCount: number;
        assignedDeveloperCount: number;
        totalProjects: number;
        periodPayrollNet: number;
    };
    topProjects: { id: string; name: string; cost: number; status: string }[];
    chartData: { label: string; capex: number; opex: number; amortization: number }[];
    assetChartData: { label: string; capitalized: number; amortized: number; netAsset: number }[];
    alerts: { id: string; name: string; message: string }[];
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
    if (!active || !payload) return null;
    return (
        <div style={{ ...TOOLTIP_STYLE, padding: 12, minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#3F4450', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
            {payload.map((entry: { color: string; name: string; value: number }, i: number) => (
                <div key={i} className="flex justify-between items-center gap-4" style={{ fontSize: 12 }}>
                    <span style={{ color: entry.color, fontWeight: 600 }}>{entry.name}</span>
                    <span style={{ color: '#3F4450', fontWeight: 700 }}>{formatCurrency(entry.value)}</span>
                </div>
            ))}
        </div>
    );
};

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const { apiParams, label: periodLabel, range } = usePeriod();

    // Short period label for KPI cards (e.g., "Mar 2026")
    const shortPeriodLabel = (() => {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[range.end.getMonth()]} ${range.end.getFullYear()}`;
    })();

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        fetch(`/api/dashboard?${apiParams}`, { signal: controller.signal })
            .then((res) => res.json())
            .then(setData)
            .catch((e) => { if (e.name !== 'AbortError') console.error(e); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [apiParams]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!data || !data.summary) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-[#717684]">
                <p className="text-[14px] font-semibold">Failed to load dashboard data</p>
                <button onClick={() => window.location.reload()} className="text-[13px] text-[#4141A2] font-bold hover:underline">
                    Retry
                </button>
            </div>
        );
    }



    // Derived mini dataset for sparklines
    const sparklineData = (data.chartData || []).slice(-6).map((d) => ({ ...d, total: d.capex + d.opex }));

    return (
        <div className="text-[#3F4450]">
            
            {/* FinTech Header */}
            <div className="flex items-end justify-between mb-6 pb-4 border-b border-[#E2E4E9]/60">
                <div>
                    <h1 className="text-[28px] font-black uppercase tracking-tight leading-none mb-1 text-[#3F4450]">Dashboard - {periodLabel}</h1>
                    <p className="text-[13px] font-semibold text-[#A4A9B6] uppercase tracking-wider">ASC 350-40 Compliance Hub</p>
                </div>
            </div>

            {/* Quick Pulse Strip */}
            {(() => {
                const totalCap = data.summary.totalAssetValue;
                const totalExp = data.summary.totalExpensed;
                // Use the payroll-derived net total as the authoritative spend for the period
                const totalSpend = data.summary.periodPayrollNet > 0
                    ? data.summary.periodPayrollNet
                    : totalCap + totalExp;
                const capRatio = totalSpend > 0 ? Math.round((totalCap / totalSpend) * 100) : 0;
                const nbv = totalCap - data.summary.ytdAmortization;
                return (
                    <div
                        className="mb-6 rounded-2xl flex items-stretch overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, #2A2B4A 0%, #3F4450 100%)',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                        }}
                    >
                        {[
                            { label: 'Total Spend', value: formatCurrency(totalSpend), color: '#fff' },
                            { label: 'Cap Ratio', value: `${capRatio}%`, color: '#A5D6A7' },
                            { label: 'Net Book Value', value: formatCurrency(nbv), color: '#90CAF9' },
                            { label: `Amort. — ${shortPeriodLabel}`, value: formatCurrency(data.summary.ytdAmortization), color: '#FFAB91' },
                            { label: 'Active Devs', value: data.summary.activeDeveloperCount.toString(), color: '#FFE082' },
                            { label: 'Open Projects', value: data.summary.totalProjects.toString(), color: '#CE93D8' },
                        ].map((kpi, i) => (
                            <div
                                key={kpi.label}
                                className="flex-1 flex flex-col items-center justify-center py-3.5 px-2 text-center"
                                style={{ borderRight: i < 5 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}
                            >
                                <span className="text-[9px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{kpi.label}</span>
                                <span className="text-[18px] font-black leading-none" style={{ color: kpi.color }}>{kpi.value}</span>
                            </div>
                        ))}
                    </div>
                );
            })()}



            {/* Performance Overview Row */}
            <div className="mb-8">
                <h2 className="text-[12px] font-extrabold text-[#717684] tracking-widest mb-4 uppercase">Performance Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    
                    {/* KPI 1 — Total Spend Breakdown */}
                    <div className="fintech-card fintech-stat-block">
                        <div className="fintech-stat-label">
                            <span>Total Spend — {shortPeriodLabel}</span>
                            <Activity className="w-4 h-4 text-[#A4A9B6]" />
                        </div>
                        <div className="fintech-stat-value">{formatCurrency(data.summary.periodPayrollNet)}</div>
                        {(() => {
                            const total = data.summary.periodPayrollNet;
                            const expensed = data.summary.totalExpensed - data.summary.totalBugCost;
                            const bugs = data.summary.totalBugCost;
                            const cap = data.summary.totalAssetValue;
                            const rows = [
                                { label: 'Expensed', value: expensed, color: '#717684' },
                                { label: 'Bug Costs', value: bugs, color: '#FA4338' },
                                { label: 'Capitalized', value: cap, color: '#4141A2' },
                            ];
                            return (
                                <div className="mt-auto flex flex-col gap-1.5">
                                    {rows.map(row => {
                                        const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
                                        return (
                                            <div key={row.label} className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold uppercase tracking-wider w-16 flex-shrink-0" style={{ color: '#A4A9B6' }}>{row.label}</span>
                                                <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: '#EEF0F4' }}>
                                                    <div style={{ width: `${pct}%`, background: row.color, height: '100%', borderRadius: '999px', transition: 'width 0.4s ease' }} />
                                                </div>
                                                <span className="text-[10px] font-black tabular-nums text-right" style={{ color: row.color, minWidth: 48 }}>{formatCurrency(row.value)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>

                    {/* KPI 2 */}
                    <div className="fintech-card fintech-stat-block">
                        <div className="fintech-stat-label">
                            <span>Amortization — {shortPeriodLabel}</span>
                            <PieChart className="w-4 h-4 text-[#A4A9B6]" />
                        </div>
                        <div className="fintech-stat-value">{formatCurrency(data.summary.ytdAmortization)}</div>
                        <div className="mt-auto flex items-end gap-3 h-[40px]">
                            <div className="text-[11px] font-bold text-[#717684] bg-[#F6F6F9] px-2 py-0.5 rounded-md mb-1 flex-shrink-0">
                                Expensed
                            </div>
                        <div className="flex-1 h-full flex flex-col justify-end pb-2">
                                <div className="h-1.5 w-full bg-[#F6F6F9] rounded-full overflow-hidden">
                                    {(() => {
                                        const total = data.summary.totalAssetValue;
                                        const amort = data.summary.ytdAmortization;
                                        const pct = total > 0 ? Math.min(100, Math.round((amort / total) * 100)) : 0;
                                        return pct > 0 ? <div className="h-full bg-[#FA4338]" style={{ width: `${pct}%` }} /> : null;
                                    })()}
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* KPI 3 */}
                    <Link href="/developers" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="fintech-card fintech-stat-block" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }} onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(65,65,162,0.12)'} onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                        <div className="fintech-stat-label">
                            <span>Active Developers</span>
                            <Users className="w-4 h-4 text-[#A4A9B6]" />
                        </div>
                        <div className="fintech-stat-value">{data.summary.activeDeveloperCount}</div>
                        <div className="mt-auto flex items-end gap-3 h-[40px]">
                            <div className="text-[11px] font-bold text-[#4141A2] bg-[#F0EAF8] px-2 py-0.5 rounded-md mb-1 flex-shrink-0">
                                Allocated Resources
                            </div>
                            {/* Stacked bar: assigned (purple) vs unassigned (gray) */}
                            {(() => {
                                const total = data.summary.activeDeveloperCount;
                                const assigned = data.summary.assignedDeveloperCount;
                                const unassigned = Math.max(0, total - assigned);
                                const assignedPct = total > 0 ? (assigned / total) * 100 : 0;
                                const unassignedPct = total > 0 ? (unassigned / total) * 100 : 0;
                                return (
                                    <div className="flex-1 h-[10px] rounded-full overflow-hidden flex mb-2" style={{ background: '#EEF0F4' }}>
                                        <div style={{ width: `${assignedPct}%`, background: '#4141A2', borderRadius: unassignedPct === 0 ? '999px' : '999px 0 0 999px', transition: 'width 0.4s ease' }} title={`Assigned: ${assigned}`} />
                                        <div style={{ width: `${unassignedPct}%`, background: '#C8CBF5', borderRadius: '0 999px 999px 0', transition: 'width 0.4s ease' }} title={`No tickets: ${unassigned}`} />
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                    </Link>

                    {/* KPI 4 */}
                    <Link href="/projects" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="fintech-card fintech-stat-block" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }} onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(65,65,162,0.12)'} onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                        <div className="fintech-stat-label">
                            <span>Active Projects</span>
                            <FolderKanban className="w-4 h-4 text-[#A4A9B6]" />
                        </div>
                        <div className="fintech-stat-value">{data.summary.totalProjects}</div>
                        <div className="mt-auto flex items-end gap-3 h-[40px]">
                            <div className="text-[11px] font-bold text-[#21944E] bg-[#EBF5EF] px-2 py-0.5 rounded-md mb-1 flex-shrink-0">
                                Tracking Costs
                            </div>
                            <div className="flex-1 h-full flex items-end justify-between pb-1 px-1">
                                {[3, 4, 3, 5, 4, 6, 7].map((h, i) => (
                                    <div key={i} className="w-[12%] bg-[#4141A2] rounded-sm opacity-50 block" style={{ height: `${h * 10}%` }} />
                                ))}
                            </div>
                        </div>
                    </div>
                    </Link>

                </div>
            </div>

            {/* Middle Grid - Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6 mb-8">
                
                {/* Capex Investment Trends */}
                <div className="fintech-card p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-[12px] font-extrabold text-[#3F4450] tracking-widest uppercase">Capex Investment Trends</h2>
                            <p className="text-[12px] text-[#A4A9B6] mt-1">Capitalized Development vs Operational Expenses</p>
                        </div>
                        <div className="flex gap-4">
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#717684]">
                                <div className="w-2 h-2 rounded-full bg-[#4141A2]" /> CAPEX
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#717684]">
                                <div className="w-2 h-2 rounded-full bg-[#FA4338]" /> OPEX
                            </span>
                        </div>
                    </div>
                    <div className="mt-2">
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={data.chartData || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                                    tickFormatter={(v) => `$${(v / 1000).toLocaleString()}k`} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    dx={-10} 
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(238, 240, 244, 0.4)' }} />
                                <Line 
                                    type="monotone" 
                                    dataKey="capex" 
                                    name="Actual CAPEX" 
                                    stroke="#4141A2" 
                                    strokeWidth={3} 
                                    dot={{ r: 4, fill: '#4141A2', strokeWidth: 2, stroke: '#FFFFFF' }} 
                                    activeDot={{ r: 6 }} 
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="opex" 
                                    name="Actual OPEX" 
                                    stroke="#FA4338" 
                                    strokeWidth={3} 
                                    dot={{ r: 4, fill: '#FA4338', strokeWidth: 2, stroke: '#FFFFFF' }} 
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Capitalized Projects */}
                <div className="fintech-card p-6 flex flex-col">
                    <div className="mb-4">
                        <h2 className="text-[12px] font-extrabold text-[#3F4450] tracking-widest uppercase">Capitalized Projects</h2>
                        <p className="text-[12px] text-[#A4A9B6] mt-1">Accumulated capitalized value by project</p>
                    </div>
                    <div className="flex-1 mt-2">
                        <ResponsiveContainer width="100%" height={Math.max(260, data.topProjects.length * 42)}>
                            <BarChart data={data.topProjects} margin={{ left: 16, right: 16, top: 8, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                <XAxis
                                    dataKey="name"
                                    tick={({ x, y, payload }) => {
                                        const words: string[] = (payload.value as string).split(' ');
                                        const lines: string[] = [];
                                        let line = '';
                                        for (const word of words) {
                                            if ((line + ' ' + word).trim().length > 14) {
                                                if (line) lines.push(line);
                                                line = word;
                                            } else {
                                                line = (line + ' ' + word).trim();
                                            }
                                        }
                                        if (line) lines.push(line);
                                        return (
                                            <g transform={`translate(${x},${y})`}>
                                                {lines.map((l, i) => (
                                                    <text key={i} x={0} y={0} dy={12 + i * 12} textAnchor="middle" fill="#3F4450" fontSize={10} fontWeight={600}>{l}</text>
                                                ))}
                                            </g>
                                        );
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }}
                                    tickFormatter={(v) => `$${(v / 1000).toLocaleString()}k`}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
                                <Bar dataKey="cost" name="Project Value" radius={[4, 4, 0, 0]} barSize={32} maxBarSize={48}>
                                    {data.topProjects.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={GEM_SHADES[index % GEM_SHADES.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* Bottom Row - NAV Waterfall and Alerts */}
            {data.assetChartData && data.assetChartData.length > 0 && (
                <div className="fintech-card p-6 mb-8">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-[12px] font-extrabold text-[#3F4450] tracking-widest uppercase">Net Asset Value Development</h2>
                            <p className="text-[12px] text-[#A4A9B6] mt-1">Capitalized buildup vs accumulated amortization</p>
                        </div>
                    </div>
                    <div>
                        <ResponsiveContainer width="100%" height={320}>
                            <ComposedChart data={data.assetChartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
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
                                    tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toLocaleString()}k` : `$${v.toLocaleString()}`} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    dx={-10} 
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(238, 240, 244, 0.4)' }} />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 20 }} />
                                
                                <Bar dataKey="capitalized" name="Gross CAPEX Added" fill="#4141A2" radius={[4, 4, 0, 0]} barSize={36} />
                                <Bar dataKey="amortized" name="Amortization Expensed" fill="#FA4338" radius={[4, 4, 0, 0]} barSize={36} />
                                <Line 
                                    type="monotone" 
                                    dataKey="netAsset" 
                                    name="Closing NAV" 
                                    stroke="#F5A623" 
                                    strokeWidth={3} 
                                    dot={{ r: 5, fill: '#F5A623', strokeWidth: 2, stroke: '#FFFFFF' }} 
                                    activeDot={{ r: 7 }} 
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* FinTech Alerts */}
            {data.alerts.length > 0 && (
                <div className="fintech-card p-6">
                    <h2 className="text-[12px] font-extrabold text-[#3F4450] tracking-widest uppercase mb-5 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#FA4338]" />
                        Action Register
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {data.alerts.map((alert: { id: string; name: string; message: string; severity?: string }) => {
                            const isCritical = alert.severity === 'critical';
                            return (
                                <Link key={alert.id} href={`/projects/${alert.id}`} className="group flex flex-col p-4 hover:bg-[#FFF5F5] border transition-all rounded-xl" style={{ textDecoration: 'none', background: isCritical ? 'rgba(250,67,56,0.04)' : 'rgba(245,166,35,0.04)', borderColor: isCritical ? 'rgba(250,67,56,0.2)' : 'rgba(245,166,35,0.2)' }}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Badge style={{ background: isCritical ? '#FA4338' : '#F5A623', color: '#FFFFFF', fontSize: 10, padding: '2px 8px' }}>
                                                {isCritical ? 'Critical' : 'Warning'}
                                            </Badge>
                                            <span className="text-[12px] font-bold text-[#3F4450]">{alert.name}</span>
                                        </div>
                                        <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 transform" style={{ color: isCritical ? '#FA4338' : '#F5A623' }} />
                                    </div>
                                    <p className="text-[13px] text-[#A4A9B6] leading-snug">
                                        {alert.message}
                                    </p>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
