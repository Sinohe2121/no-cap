'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BarChart2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PeriodMetrics {
    totalTickets: number;
    totalSP: number;
    featureSP: number;
    bugSP: number;
    capRatio: number;
    bugRatio: number;
    avgCycleTime: number;
    activeDevs: number;
    totalCapitalized: number;
    totalExpensed: number;
    totalAmortized: number;
    costPerTicket: number;
    costPerSP: number;
    totalAllocated: number;
}

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function pctChange(a: number, b: number): { value: string; positive: boolean | null } {
    if (a === 0 && b === 0) return { value: '—', positive: null };
    if (a === 0) return { value: '+∞', positive: true };
    const pct = ((b - a) / a) * 100;
    return {
        value: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
        positive: pct > 0 ? true : pct < 0 ? false : null,
    };
}

export default function PeriodComparisonPage() {
    const [periodAStart, setPeriodAStart] = useState('');
    const [periodAEnd, setPeriodAEnd] = useState('');
    const [periodBStart, setPeriodBStart] = useState('');
    const [periodBEnd, setPeriodBEnd] = useState('');
    const [data, setData] = useState<{ periodA: PeriodMetrics; periodB: PeriodMetrics } | null>(null);
    const [loading, setLoading] = useState(false);

    const runComparison = () => {
        if (!periodAStart || !periodAEnd || !periodBStart || !periodBEnd) return;
        setLoading(true);
        fetch(`/api/reports/period-comparison?periodAStart=${periodAStart}&periodAEnd=${periodAEnd}&periodBStart=${periodBStart}&periodBEnd=${periodBEnd}`)
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    };

    const METRICS: { key: keyof PeriodMetrics; label: string; format: (v: number) => string; invertColors?: boolean }[] = [
        { key: 'totalTickets', label: 'Total Tickets', format: v => v.toLocaleString() },
        { key: 'totalSP', label: 'Story Points', format: v => v.toLocaleString() },
        { key: 'featureSP', label: 'Feature SP', format: v => v.toLocaleString() },
        { key: 'bugSP', label: 'Bug SP', format: v => v.toLocaleString(), invertColors: true },
        { key: 'capRatio', label: 'Cap Ratio', format: v => `${v}%` },
        { key: 'bugRatio', label: 'Bug Ratio', format: v => `${v}%`, invertColors: true },
        { key: 'avgCycleTime', label: 'Avg Cycle Time', format: v => `${v}d`, invertColors: true },
        { key: 'activeDevs', label: 'Active Devs', format: v => v.toString() },
        { key: 'totalCapitalized', label: 'Capitalized', format: fmt },
        { key: 'totalExpensed', label: 'Expensed', format: fmt, invertColors: true },
        { key: 'totalAmortized', label: 'Amortized', format: fmt },
        { key: 'costPerTicket', label: 'Cost / Ticket', format: fmt, invertColors: true },
        { key: 'costPerSP', label: 'Cost / SP', format: fmt, invertColors: true },
        { key: 'totalAllocated', label: 'Total Allocated', format: fmt },
    ];

    const labelA = periodAStart && periodAEnd
        ? `${new Date(periodAStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${new Date(periodAEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
        : 'Period A';
    const labelB = periodBStart && periodBEnd
        ? `${new Date(periodBStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${new Date(periodBEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
        : 'Period B';

    // Chart data for side-by-side
    const chartData = data ? [
        { metric: 'Tickets', A: data.periodA.totalTickets, B: data.periodB.totalTickets },
        { metric: 'Story Pts', A: data.periodA.totalSP, B: data.periodB.totalSP },
        { metric: 'Feature SP', A: data.periodA.featureSP, B: data.periodB.featureSP },
        { metric: 'Bug SP', A: data.periodA.bugSP, B: data.periodB.bugSP },
    ] : [];

    const financialChartData = data ? [
        { metric: 'Capitalized', A: data.periodA.totalCapitalized, B: data.periodB.totalCapitalized },
        { metric: 'Expensed', A: data.periodA.totalExpensed, B: data.periodB.totalExpensed },
        { metric: 'Amortized', A: data.periodA.totalAmortized, B: data.periodB.totalAmortized },
        { metric: 'Total', A: data.periodA.totalAllocated, B: data.periodB.totalAllocated },
    ] : [];

    const inputStyle: React.CSSProperties = {
        padding: '8px 12px',
        borderRadius: 8,
        border: '1.5px solid #E2E4E9',
        fontSize: 13,
        fontWeight: 600,
        color: '#3F4450',
        background: '#FAFBFC',
        outline: 'none',
        width: '100%',
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <Link href="/reports" className="flex items-center gap-1 text-xs font-semibold mb-2 no-underline" style={{ color: 'var(--gem)' }}>
                        <ArrowLeft className="w-3 h-3" /> Reports
                    </Link>
                    <h1 className="section-header flex items-center gap-2">
                        <BarChart2 className="w-5 h-5" style={{ color: 'var(--gem)' }} />
                        Period Comparison
                    </h1>
                    <p className="section-subtext">Side-by-side comparison of any two periods — all KPIs at a glance</p>
                </div>
            </div>

            {/* Period Selectors */}
            <div className="glass-card p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Period A */}
                    <div className="rounded-xl p-4" style={{ background: '#EEF2FF', border: '1.5px solid #D5DAFF' }}>
                        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#4141A2' }}>Period A</p>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: '#717684' }}>Start</label>
                                <input type="date" style={inputStyle} value={periodAStart} onChange={e => setPeriodAStart(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: '#717684' }}>End</label>
                                <input type="date" style={inputStyle} value={periodAEnd} onChange={e => setPeriodAEnd(e.target.value)} />
                            </div>
                        </div>
                    </div>
                    {/* Period B */}
                    <div className="rounded-xl p-4" style={{ background: '#FFF5F5', border: '1.5px solid #FFD5D5' }}>
                        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#FA4338' }}>Period B</p>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: '#717684' }}>Start</label>
                                <input type="date" style={inputStyle} value={periodBStart} onChange={e => setPeriodBStart(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: '#717684' }}>End</label>
                                <input type="date" style={inputStyle} value={periodBEnd} onChange={e => setPeriodBEnd(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex justify-center mt-5">
                    <button
                        onClick={runComparison}
                        disabled={loading || !periodAStart || !periodAEnd || !periodBStart || !periodBEnd}
                        className="btn-primary"
                    >
                        {loading ? (
                            <><RefreshCw className="w-4 h-4 animate-spin" /> Comparing...</>
                        ) : (
                            <>Compare Periods <ArrowRight className="w-4 h-4" /></>
                        )}
                    </button>
                </div>
            </div>

            {/* Results */}
            {data && (
                <div className="space-y-6">
                    {/* Metrics Table */}
                    <div className="glass-card" style={{ overflow: 'hidden' }}>
                        <div className="px-6 py-4" style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E4E9' }}>
                            <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>KPI Comparison</h2>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #E2E4E9', background: '#F6F6F9' }}>
                                        <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 160 }}>Metric</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#4141A2', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{labelA}</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#FA4338', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{labelB}</th>
                                        <th style={{ padding: '10px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#717684', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {METRICS.map(m => {
                                        const vA = data.periodA[m.key];
                                        const vB = data.periodB[m.key];
                                        const change = pctChange(vA, vB);
                                        const changeColor = change.positive === null
                                            ? '#A4A9B6'
                                            : (m.invertColors
                                                ? (change.positive ? '#FA4338' : '#21944E')
                                                : (change.positive ? '#21944E' : '#FA4338'));
                                        return (
                                            <tr key={m.key} style={{ borderBottom: '1px solid #F0F0F5' }}>
                                                <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: '#3F4450' }}>{m.label}</td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#4141A2', fontVariantNumeric: 'tabular-nums' }}>{m.format(vA)}</td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#FA4338', fontVariantNumeric: 'tabular-nums' }}>{m.format(vB)}</td>
                                                <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: changeColor, fontVariantNumeric: 'tabular-nums' }}>
                                                    {change.positive !== null && (
                                                        change.positive
                                                            ? <TrendingUp className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                                                            : <TrendingDown className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                                                    )}
                                                    {change.value}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Tickets Chart */}
                        <div className="glass-card p-6">
                            <p className="text-sm font-semibold mb-1" style={{ color: '#3F4450' }}>Ticket Volume</p>
                            <p className="text-[11px] mb-4" style={{ color: '#A4A9B6' }}>Side-by-side ticket and story point counts</p>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={chartData} barCategoryGap="25%">
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                    <XAxis dataKey="metric" tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E4E9', borderRadius: 10, padding: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 12 }} />
                                    <Bar dataKey="A" name={labelA} fill="#4141A2" barSize={28} radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="B" name={labelB} fill="#FA4338" barSize={28} radius={[4, 4, 0, 0]} fillOpacity={0.8} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Financial Chart */}
                        <div className="glass-card p-6">
                            <p className="text-sm font-semibold mb-1" style={{ color: '#3F4450' }}>Financial Comparison</p>
                            <p className="text-[11px] mb-4" style={{ color: '#A4A9B6' }}>Capitalized, expensed, and amortized amounts</p>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={financialChartData} barCategoryGap="25%">
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                    <XAxis dataKey="metric" tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E4E9', borderRadius: 10, padding: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} formatter={(v: number | undefined) => fmt(v ?? 0)} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 12 }} />
                                    <Bar dataKey="A" name={labelA} fill="#4141A2" barSize={28} radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="B" name={labelB} fill="#FA4338" barSize={28} radius={[4, 4, 0, 0]} fillOpacity={0.8} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!data && !loading && (
                <div className="glass-card p-12 text-center">
                    <BarChart2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#A4A9B6' }} />
                    <p className="font-semibold" style={{ color: '#3F4450' }}>Select two periods above to compare</p>
                    <p className="text-sm mt-1" style={{ color: '#A4A9B6' }}>
                        Choose date ranges for Period A and Period B, then click &quot;Compare Periods&quot; to see a side-by-side analysis.
                    </p>
                </div>
            )}
        </div>
    );
}
