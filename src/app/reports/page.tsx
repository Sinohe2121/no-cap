'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    BarChart2, TrendingUp, Calendar, DollarSign, Target,
    ChevronDown, ChevronUp, Download, Edit2, Check, X,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { usePeriod } from '@/context/PeriodContext';
import { CHART_SEMANTIC } from '@/lib/chartColors';

// ─── Types ─────────────────────────────────────────────────────────────────

interface PortfolioAsset {
    id: string;
    name: string;
    epicKey: string;
    status: string;
    costBasis: number;
    accumulatedAmortization: number;
    netBookValue: number;
    monthlyAmortizationRate: number;
    usefulLifeMonths: number;
    monthsElapsed: number;
    monthsRemaining: number | null;
    launchDate: string | null;
    portfolioShare: number;
    fullyAmortized: boolean;
    mgmtAuthorized: boolean;
    probableToComplete: boolean;
}

interface AmortRow {
    month: number;
    year: number;
    label: string;
    amortizationExpense: number;
    accumulatedAmortization: number;
    netBookValue: number;
    isProjected: boolean;
}

interface AmortSchedule {
    projectId: string;
    projectName: string;
    epicKey: string;
    costBasis: number;
    usefulLifeMonths: number;
    launchDate: string | null;
    monthlyRate: number;
    rows: AmortRow[];
}

interface ForecastMonth {
    month: number;
    year: number;
    label: string;
    totalCap: number;
    totalExpense: number;
    totalRD: number;
}

interface BudgetRow {
    projectId: string;
    projectName: string;
    epicKey: string;
    projectStatus: string;
    budgetPerMonth: number | null;
    ytdBudget: number | null;
    ytdActual: number;
    variance: number | null;
    variancePct: number | null;
    budgetStatus: 'UNDER' | 'ON_TRACK' | 'OVER' | 'NO_BUDGET';
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function pct(n: number) {
    return `${(n * 100).toFixed(1)}%`;
}

function statusBadge(s: string) {
    const map: Record<string, { bg: string; color: string; label: string }> = {
        UNDER: { bg: '#EEF2FF', color: '#4141A2', label: 'Under' },
        ON_TRACK: { bg: '#EBF5EF', color: '#21944E', label: 'On Track' },
        OVER: { bg: '#FFF5F5', color: '#FA4338', label: 'Over Budget' },
        NO_BUDGET: { bg: '#F6F6F9', color: '#A4A9B6', label: 'No Budget Set' },
    };
    return map[s] || map.NO_BUDGET;
}

function projectStatusBadge(s: string) {
    const map: Record<string, string> = { DEV: '#4141A2', LIVE: '#21944E', PLANNING: '#D3A236', RETIRED: '#A4A9B6' };
    return map[s] || '#A4A9B6';
}

function downloadCsv(rows: AmortRow[], projectName: string) {
    const header = ['Month', 'Year', 'Amortization Expense', 'Accumulated Amortization', 'Net Book Value', 'Projected?'];
    const lines = rows.map((r) => [
        r.month, r.year, r.amortizationExpense.toFixed(2),
        r.accumulatedAmortization.toFixed(2), r.netBookValue.toFixed(2),
        r.isProjected ? 'Yes' : 'No',
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amortization-${projectName.replace(/\s+/g, '-')}.csv`;
    a.click();
}

// ─── Tab: Portfolio View ────────────────────────────────────────────────────

function PortfolioTab({ apiParams }: { apiParams: string }) {
    const [data, setData] = useState<{ summary: { totalAssets: number; totalCostBasis: number; totalNBV: number; totalAccumAmort: number; monthlyAmortBurn: number; averageUsefulLife: number }; assets: PortfolioAsset[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/reports/portfolio?${apiParams}`).then((r) => r.json()).then(setData).finally(() => setLoading(false));
    }, [apiParams]);

    if (loading) return <Spinner />;
    if (!data || data.assets.length === 0) return <Empty icon={<DollarSign className="w-10 h-10" style={{ color: '#D3D5DB' }} />} text="No capitalizable projects found" />;

    return (
        <div>
            {/* Summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                {[
                    { label: 'Total Cost Basis', val: fmt(data.summary.totalCostBasis), color: '#3F4450' },
                    { label: 'Net Book Value', val: fmt(data.summary.totalNBV), color: '#21944E' },
                    { label: 'Accumulated Amort.', val: fmt(data.summary.totalAccumAmort), color: '#4141A2' },
                    { label: 'Monthly Amort. Burn', val: fmt(data.summary.monthlyAmortBurn), color: '#FA4338' },
                    { label: 'Avg. Useful Life', val: `${data.summary.averageUsefulLife} mo`, color: '#3F4450' },
                ].map((c) => (
                    <div key={c.label} className="glass-card p-4">
                        <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>{c.label}</p>
                        <p className="text-lg font-bold" style={{ color: c.color }}>{c.val}</p>
                    </div>
                ))}
            </div>

            {/* Asset table */}
            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Asset</th>
                            <th>Phase</th>
                            <th className="text-right">Cost Basis</th>
                            <th className="text-right">Accum. Amort.</th>
                            <th className="text-right">Net Book Value</th>
                            <th>Progress</th>
                            <th>Remaining</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.assets.map((asset) => {
                            const isExp = expanded === asset.id;
                            const pctAmort = asset.costBasis > 0
                                ? Math.min(asset.accumulatedAmortization / asset.costBasis, 1)
                                : 0;
                            return (
                                <>
                                    <tr
                                        key={asset.id}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => setExpanded(isExp ? null : asset.id)}
                                    >
                                        <td>
                                            <div>
                                                <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{asset.name}</p>
                                                <p className="text-[10px] font-mono" style={{ color: '#A4A9B6' }}>{asset.epicKey}</p>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge text-xs font-semibold" style={{ background: `${projectStatusBadge(asset.status)}20`, color: projectStatusBadge(asset.status) }}>
                                                {asset.status}
                                            </span>
                                        </td>
                                        <td className="text-right"><span className="text-sm font-semibold" style={{ color: '#3F4450' }}>{fmt(asset.costBasis)}</span></td>
                                        <td className="text-right"><span className="text-sm" style={{ color: '#4141A2' }}>{fmt(asset.accumulatedAmortization)}</span></td>
                                        <td className="text-right"><span className="text-sm font-bold" style={{ color: '#21944E' }}>{fmt(asset.netBookValue)}</span></td>
                                        <td>
                                            <div className="w-28">
                                                <div className="h-1.5 rounded-full" style={{ background: '#E2E4E9' }}>
                                                    <div
                                                        className="h-1.5 rounded-full transition-all"
                                                        style={{ width: `${Math.round(pctAmort * 100)}%`, background: pctAmort >= 1 ? '#A4A9B6' : '#4141A2' }}
                                                    />
                                                </div>
                                                <p className="text-[10px] mt-0.5" style={{ color: '#A4A9B6' }}>{Math.round(pctAmort * 100)}% amortized</p>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="text-xs" style={{ color: asset.fullyAmortized ? '#A4A9B6' : '#3F4450' }}>
                                                {asset.fullyAmortized ? 'Fully amortized' : asset.monthsRemaining !== null ? `${asset.monthsRemaining} mo` : 'Pre-launch'}
                                            </span>
                                        </td>
                                        <td>
                                            {isExp ? <ChevronUp className="w-4 h-4" style={{ color: '#A4A9B6' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#A4A9B6' }} />}
                                        </td>
                                    </tr>
                                    {isExp && (
                                        <tr key={`${asset.id}-exp`} style={{ background: '#F9FAFB' }}>
                                            <td colSpan={8} style={{ padding: '12px 20px' }}>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                                    <div>
                                                        <p style={{ color: '#A4A9B6' }}>Monthly Amort.</p>
                                                        <p className="font-semibold mt-0.5" style={{ color: '#3F4450' }}>{fmt(asset.monthlyAmortizationRate)}/mo</p>
                                                    </div>
                                                    <div>
                                                        <p style={{ color: '#A4A9B6' }}>Useful Life</p>
                                                        <p className="font-semibold mt-0.5" style={{ color: '#3F4450' }}>{asset.usefulLifeMonths} months</p>
                                                    </div>
                                                    <div>
                                                        <p style={{ color: '#A4A9B6' }}>Portfolio Share</p>
                                                        <p className="font-semibold mt-0.5" style={{ color: '#3F4450' }}>{pct(asset.portfolioShare)}</p>
                                                    </div>
                                                    <div>
                                                        <p style={{ color: '#A4A9B6' }}>ASU 2025-06</p>
                                                        <p className="mt-0.5">
                                                            {asset.mgmtAuthorized && asset.probableToComplete ? '✅ Compliant' : '⚠️ Incomplete'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Tab: Amortization Schedule ─────────────────────────────────────────────

function AmortScheduleTab() {
    const [schedules, setSchedules] = useState<AmortSchedule[]>([]);
    const [selProject, setSelProject] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        fetch('/api/reports/amortization-schedule').then((r) => r.json()).then((d) => {
            setSchedules(d.schedules || []);
        }).finally(() => setLoading(false));
    }, []);

    if (loading) return <Spinner />;

    const visible = selProject === 'all' ? schedules : schedules.filter((s) => s.projectId === selProject);
    const selectedSchedule = visible[0];

    // Build chart data: annual totals
    const annualChart: Record<number, number> = {};
    if (selectedSchedule) {
        for (const row of selectedSchedule.rows) {
            annualChart[row.year] = (annualChart[row.year] || 0) + row.amortizationExpense;
        }
    }
    const chartData = Object.entries(annualChart).map(([year, amount]) => ({ year, amount }));
    const tableRows = selectedSchedule
        ? (showAll ? selectedSchedule.rows : selectedSchedule.rows.slice(0, 24))
        : [];

    if (schedules.length === 0) return <Empty icon={<Calendar className="w-10 h-10" style={{ color: '#D3D5DB' }} />} text="No LIVE projects with launch dates found" sub="Set a launch date on a project to generate its amortization schedule." />;

    return (
        <div>
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <label className="form-label mb-0">Project</label>
                    <select value={selProject} onChange={(e) => setSelProject(e.target.value)} className="form-select" style={{ minWidth: 220 }}>
                        <option value="all">All Projects</option>
                        {schedules.map((s) => <option key={s.projectId} value={s.projectId}>{s.projectName}</option>)}
                    </select>
                </div>
                {selectedSchedule && (
                    <button onClick={() => downloadCsv(selectedSchedule.rows, selectedSchedule.projectName)} className="btn-ghost">
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                )}
            </div>

            {selectedSchedule && (
                <>
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="glass-card p-4">
                            <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>Total Cost Basis</p>
                            <p className="text-lg font-bold" style={{ color: '#3F4450' }}>{fmt(selectedSchedule.costBasis)}</p>
                        </div>
                        <div className="glass-card p-4">
                            <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>Monthly Rate</p>
                            <p className="text-lg font-bold" style={{ color: '#4141A2' }}>{fmt(selectedSchedule.monthlyRate)}</p>
                        </div>
                        <div className="glass-card p-4">
                            <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>Useful Life</p>
                            <p className="text-lg font-bold" style={{ color: '#3F4450' }}>{selectedSchedule.usefulLifeMonths} months</p>
                        </div>
                    </div>

                    {/* Annual bar chart */}
                    {chartData.length > 0 && (
                        <div className="glass-card p-5 mb-6">
                            <p className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Annual Amortization Expense</p>
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={chartData} barSize={32}>
                                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#A4A9B6' }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={(v) => `$${(v / 1000).toLocaleString()}k`} tick={{ fontSize: 11, fill: '#A4A9B6' }} axisLine={false} tickLine={false} />
                                    <Tooltip formatter={(v: number | undefined) => v !== undefined ? fmt(v) : '—'} cursor={{ fill: 'rgba(65,65,162,0.05)' }} />
                                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                                        {chartData.map((_, i) => <Cell key={i} fill="#4141A2" fillOpacity={0.8} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Table */}
                    <div className="glass-card overflow-hidden">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Period</th>
                                    <th className="text-right">Amort. Expense</th>
                                    <th className="text-right">Accum. Amort.</th>
                                    <th className="text-right">Net Book Value</th>
                                    <th>Type</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row, i) => (
                                    <tr key={i} style={{ opacity: row.isProjected ? 0.7 : 1 }}>
                                        <td><span className="text-sm font-medium" style={{ color: '#3F4450' }}>{row.label}</span></td>
                                        <td className="text-right"><span className="text-sm" style={{ color: '#4141A2' }}>{fmt(row.amortizationExpense)}</span></td>
                                        <td className="text-right"><span className="text-sm" style={{ color: '#717684' }}>{fmt(row.accumulatedAmortization)}</span></td>
                                        <td className="text-right"><span className="text-sm font-semibold" style={{ color: '#21944E' }}>{fmt(row.netBookValue)}</span></td>
                                        <td>
                                            <span className="badge text-[10px]" style={{ background: row.isProjected ? '#FFFBEB' : '#EBF5EF', color: row.isProjected ? '#F5A623' : '#21944E' }}>
                                                {row.isProjected ? 'Projected' : 'Actual'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {selectedSchedule.rows.length > 24 && (
                        <button onClick={() => setShowAll(!showAll)} className="btn-ghost mt-3 text-xs">
                            {showAll ? 'Show less' : `Show all ${selectedSchedule.rows.length} months`}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Tab: Forecast Mode ─────────────────────────────────────────────────────

function ForecastTab({ apiParams }: { apiParams: string }) {
    const [data, setData] = useState<{
        summary: { totalForecastCap: number; totalForecastRD: number; avgCapRate: number; basedOnPeriods: number };
        actuals: { label: string; totalCap: number; totalExpense: number; totalRD: number; isActual: boolean }[];
        forecast: ForecastMonth[];
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/reports/forecast?${apiParams}`).then((r) => r.json()).then(setData).finally(() => setLoading(false));
    }, [apiParams]);

    if (loading) return <Spinner />;
    if (!data) return <Empty icon={<TrendingUp className="w-10 h-10" style={{ color: '#D3D5DB' }} />} text="Not enough historical data to generate forecast" />;

    const chartData = [
        ...data.actuals.map((a) => ({ label: a.label, cap: a.totalCap, expense: a.totalExpense, type: 'actual' })),
        ...data.forecast.map((f) => ({ label: f.label, cap: f.totalCap, expense: f.totalExpense, type: 'forecast' })),
    ];

    return (
        <div>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="glass-card p-4">
                    <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>6-Month Forecast Cap</p>
                    <p className="text-lg font-bold" style={{ color: '#21944E' }}>{fmt(data.summary.totalForecastCap)}</p>
                </div>
                <div className="glass-card p-4">
                    <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>6-Month Forecast R&D</p>
                    <p className="text-lg font-bold" style={{ color: '#3F4450' }}>{fmt(data.summary.totalForecastRD)}</p>
                </div>
                <div className="glass-card p-4">
                    <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>Projected Cap Rate</p>
                    <p className="text-lg font-bold" style={{ color: '#4141A2' }}>{pct(data.summary.avgCapRate)}</p>
                </div>
                <div className="glass-card p-4">
                    <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>Based On</p>
                    <p className="text-lg font-bold" style={{ color: '#3F4450' }}>{data.summary.basedOnPeriods} periods</p>
                </div>
            </div>

            {/* Stacked bar chart: actuals + forecast */}
            <div className="glass-card p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>R&D Cost Outlook — Actuals vs. Forecast</p>
                    <div className="flex items-center gap-4 text-xs" style={{ color: '#A4A9B6' }}>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: CHART_SEMANTIC.capitalized, display: 'inline-block' }} /> Capitalized</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: CHART_SEMANTIC.expensed, display: 'inline-block' }} /> Expensed</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-dashed" style={{ borderColor: '#A4A9B6', display: 'inline-block' }} /> Forecast</span>
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData} barSize={24} barGap={2}>
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#A4A9B6' }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => `$${(v / 1000).toLocaleString()}k`} tick={{ fontSize: 11, fill: '#A4A9B6' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number | undefined) => v !== undefined ? fmt(v) : '—'} cursor={{ fill: 'rgba(65,65,162,0.04)' }} />
                        <Bar dataKey="cap" name="Capitalized" stackId="a" radius={[0, 0, 0, 0]}>
                            {chartData.map((row, i) => (
                                <Cell key={i} fill={CHART_SEMANTIC.capitalized} fillOpacity={row.type === 'forecast' ? 0.4 : 0.85} />
                            ))}
                        </Bar>
                        <Bar dataKey="expense" name="Expensed" stackId="a" radius={[4, 4, 0, 0]}>
                            {chartData.map((row, i) => (
                                <Cell key={i} fill={CHART_SEMANTIC.expensed} fillOpacity={row.type === 'forecast' ? 0.4 : 0.85} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Forecast table */}
            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Period</th>
                            <th className="text-right">Projected Cap</th>
                            <th className="text-right">Projected Expense</th>
                            <th className="text-right">Total R&D</th>
                            <th className="text-right">Cap Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.forecast.map((f, i) => {
                            const capRate = f.totalRD > 0 ? f.totalCap / f.totalRD : 0;
                            return (
                                <tr key={i}>
                                    <td>
                                        <span className="text-sm font-medium" style={{ color: '#3F4450' }}>{f.label}</span>
                                        <span className="badge text-[10px] ml-2" style={{ background: '#FFFBEB', color: '#D3A236' }}>Projected</span>
                                    </td>
                                    <td className="text-right"><span className="text-sm font-semibold" style={{ color: '#21944E' }}>{fmt(f.totalCap)}</span></td>
                                    <td className="text-right"><span className="text-sm" style={{ color: '#FA4338' }}>{fmt(f.totalExpense)}</span></td>
                                    <td className="text-right"><span className="text-sm font-bold" style={{ color: '#3F4450' }}>{fmt(f.totalRD)}</span></td>
                                    <td className="text-right"><span className="text-sm" style={{ color: '#4141A2' }}>{pct(capRate)}</span></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Tab: Budget vs. Actuals ────────────────────────────────────────────────

function BudgetTab({ apiParams }: { apiParams: string }) {
    const [data, setData] = useState<{
        summary: { year: number; monthsElapsed: number; totalYtdActual: number; totalYtdBudget: number | null; totalVariance: number | null; projectsOverBudget: number; projectsWithNoBudget: number };
        rows: BudgetRow[];
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/reports/budget-vs-actuals?${apiParams}`);
            setData(await res.json());
        } finally { setLoading(false); }
    }, [apiParams]);

    useEffect(() => { load(); }, [load]);

    const saveBudget = async (projectId: string) => {
        setSaving(true);
        try {
            await fetch('/api/reports/budget-vs-actuals', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, budgetTarget: editValue === '' ? null : parseFloat(editValue) }),
            });
            setEditing(null);
            load();
        } finally { setSaving(false); }
    };

    if (loading) return <Spinner />;
    if (!data) return <Empty icon={<Target className="w-10 h-10" style={{ color: '#D3D5DB' }} />} text="No data available" />;

    return (
        <div>
            {/* YTD summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="glass-card p-4">
                    <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>YTD Actual Capitalized</p>
                    <p className="text-lg font-bold" style={{ color: '#3F4450' }}>{fmt(data.summary.totalYtdActual)}</p>
                </div>
                <div className="glass-card p-4">
                    <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>YTD Budget</p>
                    <p className="text-lg font-bold" style={{ color: '#3F4450' }}>
                        {data.summary.totalYtdBudget !== null ? fmt(data.summary.totalYtdBudget) : '—'}
                    </p>
                </div>
                <div className="glass-card p-4">
                    <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>YTD Variance</p>
                    <p className="text-lg font-bold" style={{
                        color: data.summary.totalVariance !== null
                            ? data.summary.totalVariance > 0 ? '#FA4338' : '#21944E'
                            : '#A4A9B6'
                    }}>
                        {data.summary.totalVariance !== null
                            ? `${data.summary.totalVariance >= 0 ? '+' : ''}${fmt(data.summary.totalVariance)}`
                            : '—'}
                    </p>
                </div>
                <div className="glass-card p-4">
                    <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>Over Budget</p>
                    <p className="text-lg font-bold" style={{ color: data.summary.projectsOverBudget > 0 ? '#FA4338' : '#21944E' }}>
                        {data.summary.projectsOverBudget} project{data.summary.projectsOverBudget !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            {data.summary.projectsWithNoBudget > 0 && (
                <div className="rounded-xl p-3 mb-6 flex items-center gap-3" style={{ background: '#FFFBEB', border: '1px solid rgba(211,162,54,0.2)' }}>
                    <Target className="w-4 h-4 flex-shrink-0" style={{ color: '#D3A236' }} />
                    <p className="text-xs" style={{ color: '#717684' }}>
                        {data.summary.projectsWithNoBudget} project{data.summary.projectsWithNoBudget !== 1 ? 's have' : ' has'} no budget set.
                        Click the <strong>edit</strong> icon on any row to set a monthly budget target.
                    </p>
                </div>
            )}

            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Phase</th>
                            <th className="text-right">Monthly Budget</th>
                            <th className="text-right">YTD Budget</th>
                            <th className="text-right">YTD Actual</th>
                            <th className="text-right">Variance</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row) => {
                            const badge = statusBadge(row.budgetStatus);
                            const isEditing = editing === row.projectId;
                            return (
                                <tr key={row.projectId}>
                                    <td>
                                        <div>
                                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{row.projectName}</p>
                                            <p className="text-[10px] font-mono" style={{ color: '#A4A9B6' }}>{row.epicKey}</p>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="badge text-xs" style={{ background: `${projectStatusBadge(row.projectStatus)}20`, color: projectStatusBadge(row.projectStatus) }}>
                                            {row.projectStatus}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        {isEditing ? (
                                            <div className="flex items-center justify-end gap-1">
                                                <span className="text-xs" style={{ color: '#A4A9B6' }}>$</span>
                                                <input
                                                    type="number"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    className="form-input text-right text-xs"
                                                    style={{ width: 90, padding: '3px 6px' }}
                                                    placeholder="0"
                                                    autoFocus
                                                />
                                            </div>
                                        ) : (
                                            <span className="text-sm" style={{ color: '#3F4450' }}>
                                                {row.budgetPerMonth !== null ? fmt(row.budgetPerMonth) : <span style={{ color: '#A4A9B6' }}>—</span>}
                                            </span>
                                        )}
                                    </td>
                                    <td className="text-right">
                                        <span className="text-sm" style={{ color: '#717684' }}>
                                            {row.ytdBudget !== null ? fmt(row.ytdBudget) : <span style={{ color: '#A4A9B6' }}>—</span>}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>{fmt(row.ytdActual)}</span>
                                    </td>
                                    <td className="text-right">
                                        {row.variance !== null ? (
                                            <span className="text-sm font-semibold" style={{ color: row.variance > 0 ? '#FA4338' : '#21944E' }}>
                                                {row.variance >= 0 ? '+' : ''}{fmt(row.variance)}
                                                {row.variancePct !== null && (
                                                    <span className="text-[10px] font-normal ml-1">({pct(Math.abs(row.variancePct))})</span>
                                                )}
                                            </span>
                                        ) : <span style={{ color: '#A4A9B6' }}>—</span>}
                                    </td>
                                    <td>
                                        <span className="badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                                    </td>
                                    <td>
                                        {isEditing ? (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => saveBudget(row.projectId)}
                                                    disabled={saving}
                                                    className="btn-ghost text-xs"
                                                    style={{ color: '#21944E', padding: '3px 6px' }}
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setEditing(null)}
                                                    className="btn-ghost text-xs"
                                                    style={{ color: '#A4A9B6', padding: '3px 6px' }}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setEditing(row.projectId); setEditValue(row.budgetPerMonth?.toString() || ''); }}
                                                className="btn-ghost text-xs"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Shared Micro-components ────────────────────────────────────────────────

function Spinner() {
    return (
        <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: '#4141A2', borderTopColor: 'transparent' }} />
        </div>
    );
}

function Empty({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
    return (
        <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
            {icon}
            <p className="text-sm font-medium mt-3" style={{ color: '#717684' }}>{text}</p>
            {sub && <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>{sub}</p>}
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const TABS = [
    { id: 'portfolio', label: 'Portfolio View', icon: DollarSign },
    { id: 'amort', label: 'Amortization Schedule', icon: Calendar },
    { id: 'forecast', label: 'Forecast', icon: TrendingUp },
    { id: 'budget', label: 'Budget vs. Actuals', icon: Target },
];

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState('portfolio');
    const { apiParams } = usePeriod();

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <BarChart2 className="w-6 h-6" style={{ color: '#4141A2' }} />
                    <h1 className="section-header" style={{ marginBottom: 0 }}>Reports & Planning</h1>
                </div>
                <p className="section-subtext">R&D investment portfolio, amortization schedules, forecasting, and budget tracking</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: '#F6F6F9', width: 'fit-content', flexWrap: 'wrap' }}>
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{
                                background: isActive ? '#FFFFFF' : 'transparent',
                                color: isActive ? '#3F4450' : '#A4A9B6',
                                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            }}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            {activeTab === 'portfolio' && <PortfolioTab apiParams={apiParams} />}
            {activeTab === 'amort' && <AmortScheduleTab />}
            {activeTab === 'forecast' && <ForecastTab apiParams={apiParams} />}
            {activeTab === 'budget' && <BudgetTab apiParams={apiParams} />}
        </div>
    );
}
