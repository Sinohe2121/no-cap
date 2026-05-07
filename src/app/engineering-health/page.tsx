'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePeriod } from '@/context/PeriodContext';
import { CHART_SEMANTIC, TOOLTIP_STYLE } from '@/lib/chartColors';
import { JiraTicketLink } from '@/components/JiraTicketPanel';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    AreaChart, Area, CartesianGrid, Legend,
} from 'recharts';
import { Activity, Bug, Code2, Clock, DollarSign, Users, TrendingUp, ArrowLeft } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────── */
interface Summary {
    totalTickets: number;
    totalStoryPoints: number;
    bugStoryPoints: number;
    featureStoryPoints: number;
    capRatio: number;
    bugRatio: number;
    avgCycleTimeDays: number;
    medianCycleTimeDays: number;
    totalBugCost: number;
    totalDevSpend: number;
    activeDevelopers: number;
}

interface MonthlyRow {
    month: string;
    features: number;
    bugs: number;
    tasks: number;
    total: number;
}

interface CycleBucket {
    label: string;
    count: number;
}

interface HeatmapDev {
    developer: { id: string; name: string };
    projects: { projectId: string; projectName: string; points: number; pct: number }[];
    bugPoints: number;
    totalPoints: number;
    capRatio: number;
}

interface ExpensiveTicket {
    ticketId: string;
    summary: string;
    issueType: string;
    storyPoints: number;
    developer: string;
    project: string;
    estimatedCost: number;
    isCapitalizable: boolean;
}

interface HealthData {
    summary: Summary;
    monthlyDistribution: MonthlyRow[];
    cycleTimeBuckets: CycleBucket[];
    heatmap: HeatmapDev[];
    topExpensiveTickets: ExpensiveTicket[];
    projects: { id: string; name: string }[];
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number, decimals = 0) => Number.isInteger(n) ? n.toLocaleString() : parseFloat(n.toFixed(decimals)).toLocaleString();
const fmtBugs = (n: number) => fmtNum(n, 1);
const fmtPct = (n: number) => fmtNum(n, 0);

/* ─── Component ─────────────────────────────────────────────────── */
export default function EngineeringHealthPage() {
    const { apiParams } = usePeriod();
    const [data, setData] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/engineering-health?${apiParams}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [apiParams]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--envoy-red)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <p className="section-subtext">No engineering data available for this period.</p>
            </div>
        );
    }

    const { summary: s, monthlyDistribution, cycleTimeBuckets, heatmap, topExpensiveTickets } = data;

    // Heatmap: get top 5 projects across all devs
    const allProjectIds = new Set<string>();
    for (const dev of heatmap) {
        for (const p of dev.projects) allProjectIds.add(p.projectId);
    }
    const topProjectIds = Array.from(allProjectIds).slice(0, 6);
    const topProjects = data.projects.filter(p => topProjectIds.includes(p.id));

    return (
        <div>
            {/* Header — eyebrow + h1 + description per Variation A title pattern */}
            <div className="mb-6">
                <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold mb-3 no-underline hover:underline" style={{ color: 'var(--envoy-red)' }}>
                    <ArrowLeft className="w-3 h-3" /> Dashboard
                </Link>
                <p className="eyebrow" style={{ color: 'var(--envoy-red)', letterSpacing: '0.1em', marginBottom: 4 }}>
                    Team Performance
                </p>
                <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
                    Engineering Health
                </h1>
                <p style={{ fontSize: 14, color: 'var(--fg-2)', marginTop: 6, maxWidth: 720 }}>
                    Bug vs. feature distribution, cycle time, velocity trends, and cost attribution.
                </p>
            </div>

            {/* KPI strip — Variation A divided cells */}
            <div className="kpi-strip mb-6" style={{ flexWrap: 'wrap' }}>
                <KPI icon={<Code2 className="w-4 h-4" />} label="Total Story Points" value={fmtNum(s.totalStoryPoints)} color="var(--fg-1)" />
                <KPI icon={<Bug className="w-4 h-4" />} label="Bug Ratio" value={`${fmtPct(s.bugRatio)}%`} color="var(--envoy-red)" subtitle={`${fmtBugs(s.bugStoryPoints)} SP on bugs`} />
                <KPI icon={<TrendingUp className="w-4 h-4" />} label="Cap Ratio" value={`${fmtPct(s.capRatio)}%`} color="var(--envoy-cilantro)" subtitle={`${fmtNum(s.featureStoryPoints)} SP capitalized`} />
                <KPI icon={<Clock className="w-4 h-4" />} label="Avg Cycle Time" value={`${fmtNum(s.avgCycleTimeDays, 1)}d`} color="var(--fg-1)" subtitle={`Median: ${fmtNum(s.medianCycleTimeDays)}d`} />
                <KPI icon={<DollarSign className="w-4 h-4" />} label="Bug Cost" value={fmt(s.totalBugCost)} color="var(--envoy-red)" subtitle="Est. dollars on bugs" />
                <KPI icon={<Users className="w-4 h-4" />} label="Active Devs" value={s.activeDevelopers.toString()} color="var(--fg-1)" subtitle={`${fmtNum(s.totalTickets)} tickets`} />
            </div>

            {/* ── Row 1: Bug vs Feature + Cycle Time ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Bug vs Feature Area Chart */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-1)' }}>Bug vs. Feature Distribution</p>
                            <p style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>Story points by type — 12-month trend</p>
                        </div>
                        <div className="flex items-center gap-4 text-[10px]" style={{ color: 'var(--fg-3)' }}>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: CHART_SEMANTIC.capitalized, display: 'inline-block' }} /> Features</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: CHART_SEMANTIC.bugs, display: 'inline-block' }} /> Bugs</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: CHART_SEMANTIC.tasks, display: 'inline-block' }} /> Tasks</span>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={monthlyDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E4E9" />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#A4A9B6' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#A4A9B6' }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Area type="monotone" dataKey="features" name="Features" stackId="1" stroke={CHART_SEMANTIC.capitalized} fill={CHART_SEMANTIC.capitalized} fillOpacity={0.7} />
                            <Area type="monotone" dataKey="tasks" name="Tasks" stackId="1" stroke={CHART_SEMANTIC.tasks} fill={CHART_SEMANTIC.tasks} fillOpacity={0.5} />
                            <Area type="monotone" dataKey="bugs" name="Bugs" stackId="1" stroke={CHART_SEMANTIC.bugs} fill={CHART_SEMANTIC.bugs} fillOpacity={0.6} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Cycle Time Histogram */}
                <div className="glass-card p-6">
                    <div className="mb-4">
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-1)' }}>Cycle Time Distribution</p>
                        <p style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>Days from creation to resolution — all resolved tickets</p>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={cycleTimeBuckets} barCategoryGap="20%">
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#A4A9B6' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#A4A9B6' }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="count" name="Tickets" radius={[6, 6, 0, 0]}>
                                {cycleTimeBuckets.map((_, i) => (
                                    <Cell key={i} fill={i < 2 ? 'var(--cilantro)' : i < 4 ? 'var(--amber)' : 'var(--envoy-red)'} fillOpacity={0.85} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── Row 2: Developer Effort Heatmap ── */}
            <div className="glass-card p-6 mb-6">
                <div className="mb-4">
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-1)' }}>Developer Effort Attribution</p>
                    <p style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>Story point distribution by developer × project — intensity shows % of total effort</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: '3px' }}>
                        <thead>
                            <tr>
                                <th className="text-left text-[11px] font-semibold px-3 py-2" style={{ color: 'var(--fg-2)' }}>Developer</th>
                                {topProjects.map(p => (
                                    <th key={p.id} className="text-center text-[10px] font-bold uppercase tracking-wider px-2 py-2" style={{ color: 'var(--fg-2)', maxWidth: 100 }}>
                                        {p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name}
                                    </th>
                                ))}
                                <th className="text-center text-[10px] font-bold uppercase tracking-wider px-2 py-2" style={{ color: 'var(--fg-2)' }}>Bugs</th>
                                <th className="text-center text-[10px] font-bold uppercase tracking-wider px-2 py-2" style={{ color: '#21944E' }}>Cap Ratio</th>
                            </tr>
                        </thead>
                        <tbody>
                            {heatmap.map(dev => (
                                <tr key={dev.developer.id}>
                                    <td className="px-3 py-2">
                                        <Link href={`/developers/${dev.developer.id}`} className="text-sm font-semibold no-underline" style={{ color: 'var(--fg-1)' }}>
                                            {dev.developer.name}
                                        </Link>
                                        <span className="text-[10px] ml-2" style={{ color: 'var(--fg-3)' }}>{fmtNum(dev.totalPoints, 1)} SP</span>
                                    </td>
                                    {topProjects.map(tp => {
                                        const match = dev.projects.find(p => p.projectId === tp.id);
                                        const pct = match?.pct || 0;
                                        const intensity = Math.min(pct / 50, 1); // 50%+ = full intensity
                                        return (
                                            <td key={tp.id} className="text-center" style={{ padding: 3 }}>
                                                <div
                                                    className="rounded-lg flex items-center justify-center text-[11px] font-bold transition-all"
                                                    style={{
                                                        background: pct > 0 ? `rgba(65, 65, 162, ${0.08 + intensity * 0.55})` : '#F6F6F9',
                                                        color: pct > 30 ? '#FFFFFF' : pct > 0 ? '#4141A2' : '#C8CAD0',
                                                        height: 36,
                                                        minWidth: 50,
                                                    }}
                                                >
                                                    {pct > 0 ? `${fmtPct(pct)}%` : '—'}
                                                </div>
                                            </td>
                                        );
                                    })}
                                    <td className="text-center" style={{ padding: 3 }}>
                                        <div
                                            className="rounded-lg flex items-center justify-center text-[11px] font-bold"
                                            style={{
                                                background: dev.bugPoints > 0 ? `rgba(250, 67, 56, ${Math.min(0.1 + (dev.bugPoints / dev.totalPoints) * 0.6, 0.7)})` : '#F6F6F9',
                                                color: dev.bugPoints > 0 ? '#FA4338' : '#C8CAD0',
                                                height: 36,
                                                minWidth: 50,
                                            }}
                                        >
                                            {dev.bugPoints > 0 ? fmtBugs(dev.bugPoints) : '—'}
                                        </div>
                                    </td>
                                    <td className="text-center" style={{ padding: 3 }}>
                                        <div
                                            className="rounded-lg flex items-center justify-center text-[11px] font-bold"
                                            style={{
                                                background: '#EBF5EF',
                                                color: '#21944E',
                                                height: 36,
                                                minWidth: 50,
                                            }}
                                        >
                                            {fmtPct(dev.capRatio)}%
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Row 3: Top 10 Most Expensive Tickets ── */}
            <div className="glass-card p-6">
                <div className="mb-4">
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-1)' }}>Top 10 Most Expensive Tickets</p>
                    <p style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>Estimated cost based on developer loaded rate × story points</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
                                <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>Ticket</th>
                                <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>Summary</th>
                                <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>Type</th>
                                <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>Developer</th>
                                <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>Project</th>
                                <th className="text-right py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>SP</th>
                                <th className="text-right py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>Est. Cost</th>
                                <th className="text-center py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>Class</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topExpensiveTickets.map((t, i) => (
                                <tr key={t.ticketId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    <td className="py-2.5">
                                        <JiraTicketLink ticketId={t.ticketId} className="text-xs" style={{ color: 'var(--gem)', fontWeight: 700 }} />
                                    </td>
                                    <td className="py-2.5 pr-4" style={{ maxWidth: 260 }}>
                                        <span className="text-xs" style={{ color: 'var(--fg-1)' }}>{t.summary.length > 50 ? t.summary.slice(0, 50) + '…' : t.summary}</span>
                                    </td>
                                    <td className="py-2.5">
                                        <span
                                            className="badge text-[10px]"
                                            style={{
                                                background: t.issueType === 'Bug' || t.issueType === 'BUG' ? 'var(--tint-error)' : t.issueType === 'Story' || t.issueType === 'STORY' ? 'var(--tint-accent)' : 'var(--tint-info)',
                                                color: t.issueType === 'Bug' || t.issueType === 'BUG' ? 'var(--envoy-red)' : t.issueType === 'Story' || t.issueType === 'STORY' ? 'var(--gem)' : 'var(--slate)',
                                            }}
                                        >
                                            {t.issueType}
                                        </span>
                                    </td>
                                    <td className="py-2.5 text-xs" style={{ color: 'var(--fg-2)' }}>{t.developer}</td>
                                    <td className="py-2.5 text-xs" style={{ color: 'var(--fg-2)' }}>{t.project}</td>
                                    <td className="py-2.5 text-right text-xs font-semibold" style={{ color: 'var(--fg-1)' }}>{t.storyPoints}</td>
                                    <td className="py-2.5 text-right text-xs font-bold" style={{ color: 'var(--gem)' }}>{fmt(t.estimatedCost)}</td>
                                    <td className="py-2.5 text-center">
                                        <span
                                            className="badge text-[10px]"
                                            style={{
                                                background: t.isCapitalizable ? 'var(--tint-success)' : 'var(--tint-warning)',
                                                color: t.isCapitalizable ? '#21944E' : 'var(--amber)',
                                            }}
                                        >
                                            {t.isCapitalizable ? 'CAPEX' : 'OPEX'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {topExpensiveTickets.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-sm" style={{ color: 'var(--fg-3)' }}>
                                        No ticket cost data available for this period. Ensure payroll and tickets are imported.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ─── KPI Cell — renders inside .kpi-strip per Variation A ─────── */
function KPI({ icon, label, value, color, subtitle }: { icon: React.ReactNode; label: string; value: string; color: string; subtitle?: string }) {
    return (
        <div className="kpi-cell" style={{ minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ display: 'inline-flex', width: 18, height: 18, alignItems: 'center', justifyContent: 'center', color: 'var(--fg-2)' }}>
                    {icon}
                </span>
                <span className="eyebrow">{label}</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {value}
            </p>
            {subtitle && <p style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>{subtitle}</p>}
        </div>
    );
}
