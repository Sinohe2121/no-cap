'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, FolderKanban, TrendingUp, Bug, DollarSign, BarChart2 } from 'lucide-react';
import { usePeriod } from '@/context/PeriodContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TOOLTIP_STYLE } from '@/lib/chartColors';

interface TeamMember {
    id: string;
    name: string;
    totalSP: number;
    ticketCount: number;
    bugSP: number;
    allocatedCost: number;
    capSP: number;
}

interface TeamData {
    projectId: string;
    projectName: string;
    members: TeamMember[];
    totalSP: number;
    totalTickets: number;
    totalCost: number;
    bugSP: number;
    capSP: number;
    capRatio: number;
    bugRatio: number;
    costPerSP: number;
}

interface Summary {
    totalTeams: number;
    totalDevs: number;
    totalSP: number;
    totalCost: number;
    avgCapRatio: number;
    avgBugRatio: number;
}

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtShort(n: number) {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
}

export default function TeamViewPage() {
    const { apiParams } = usePeriod();
    const [teams, setTeams] = useState<TeamData[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
        setLoading(true);
        fetch(`/api/teams?${apiParams}`)
            .then(r => r.json())
            .then(d => {
                setTeams(d.teams || []);
                setSummary(d.summary || null);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [apiParams]);

    const toggle = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Chart data
    const costChart = teams.map(t => ({
        name: t.projectName.length > 14 ? t.projectName.slice(0, 14) + '…' : t.projectName,
        cost: t.totalCost,
    }));

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <Link href="/developers" className="flex items-center gap-1 text-xs font-semibold mb-2 no-underline" style={{ color: 'var(--gem)' }}>
                        <ArrowLeft className="w-3 h-3" /> FTE & Payroll
                    </Link>
                    <h1 className="section-header flex items-center gap-2">
                        <Users className="w-5 h-5" style={{ color: 'var(--gem)' }} />
                        Team View
                    </h1>
                    <p className="section-subtext">Developers grouped by primary project — team-level cost, velocity, and cap ratio rollups</p>
                </div>
            </div>

            {/* KPIs */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                    <KPI icon={<FolderKanban className="w-4 h-4" />} label="Teams" value={summary.totalTeams.toString()} color="var(--gem)" />
                    <KPI icon={<Users className="w-4 h-4" />} label="Developers" value={summary.totalDevs.toString()} color="#F5A623" />
                    <KPI icon={<BarChart2 className="w-4 h-4" />} label="Total SP" value={summary.totalSP.toLocaleString()} color="var(--gem)" />
                    <KPI icon={<DollarSign className="w-4 h-4" />} label="Total Cost" value={fmtShort(summary.totalCost)} color="#FA4338" />
                    <KPI icon={<TrendingUp className="w-4 h-4" />} label="Avg Cap Ratio" value={`${summary.avgCapRatio}%`} color="#21944E" />
                    <KPI icon={<Bug className="w-4 h-4" />} label="Avg Bug Ratio" value={`${summary.avgBugRatio}%`} color="#FA4338" />
                </div>
            )}

            {/* Cost by Team Chart */}
            {costChart.length > 0 && (
                <div className="glass-card p-6 mb-6">
                    <p className="text-sm font-semibold mb-1" style={{ color: '#3F4450' }}>Cost by Team</p>
                    <p className="text-[11px] mb-4" style={{ color: '#A4A9B6' }}>Total allocated cost per project-team</p>
                    <ResponsiveContainer width="100%" height={Math.max(200, costChart.length * 44)}>
                        <BarChart data={costChart} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EEF0F4" />
                            <XAxis type="number" tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }} tickFormatter={(v: number) => fmtShort(v)} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#3F4450', fontWeight: 600 }} axisLine={false} tickLine={false} width={110} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number | undefined) => [fmt(v ?? 0), 'Cost']} cursor={{ fill: 'rgba(238, 240, 244, 0.4)' }} />
                            <Bar dataKey="cost" radius={[0, 6, 6, 0]} barSize={28}>
                                {costChart.map((_, i) => (
                                    <Cell key={i} fill={`hsl(${245 - i * 20}, 55%, ${48 + i * 4}%)`} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Team Cards */}
            {teams.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="No team data available"
                    description="Ensure developers have tickets assigned in the selected period. Teams are automatically grouped by primary project allocation."
                    ctaLabel="FTE & Payroll"
                    ctaHref="/developers"
                    secondaryLabel="Import from Jira"
                    secondaryHref="/admin"
                />
            ) : (
                <div className="space-y-4">
                    {teams.map(team => {
                        const isOpen = expanded.has(team.projectId);
                        return (
                            <div key={team.projectId} className="glass-card" style={{ overflow: 'hidden' }}>
                                {/* Team Header */}
                                <button
                                    onClick={() => toggle(team.projectId)}
                                    className="w-full flex items-center justify-between px-6 py-4 text-left"
                                    style={{ background: isOpen ? '#FAFBFC' : 'transparent', borderBottom: isOpen ? '1px solid #E2E4E9' : 'none', cursor: 'pointer', border: 'none' }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#EEF2FF' }}>
                                            <FolderKanban className="w-4 h-4" style={{ color: '#4141A2' }} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold" style={{ color: '#3F4450' }}>{team.projectName}</p>
                                            <p className="text-[11px]" style={{ color: '#A4A9B6' }}>{team.members.length} developer{team.members.length !== 1 ? 's' : ''} • {team.totalTickets} tickets</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6 text-[11px]">
                                        <div className="text-right">
                                            <span className="block font-bold" style={{ color: '#4141A2' }}>{team.totalSP} SP</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-bold" style={{ color: '#FA4338' }}>{fmt(team.totalCost)}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-bold" style={{ color: '#21944E' }}>{team.capRatio}%</span>
                                            <span className="block text-[9px]" style={{ color: '#A4A9B6' }}>Cap</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-bold" style={{ color: team.bugRatio > 30 ? '#FA4338' : '#F5A623' }}>{team.bugRatio}%</span>
                                            <span className="block text-[9px]" style={{ color: '#A4A9B6' }}>Bugs</span>
                                        </div>
                                        <span className="text-xs font-bold" style={{ color: '#A4A9B6' }}>{isOpen ? '▾' : '▸'}</span>
                                    </div>
                                </button>

                                {/* Member Breakdown */}
                                {isOpen && (
                                    <div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#F6F6F9', borderBottom: '2px solid #E2E4E9' }}>
                                                    <th style={{ padding: '8px 20px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Developer</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tickets</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SP</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bug SP</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cap SP</th>
                                                    <th style={{ padding: '8px 20px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {team.members.map(m => (
                                                    <tr key={m.id} style={{ borderBottom: '1px solid #F0F0F5' }}>
                                                        <td style={{ padding: '10px 20px' }}>
                                                            <Link href={`/developers/${m.id}`} className="text-[13px] font-semibold no-underline" style={{ color: '#3F4450' }}>
                                                                {m.name}
                                                            </Link>
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#717684', fontVariantNumeric: 'tabular-nums' }}>{m.ticketCount}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#3F4450', fontVariantNumeric: 'tabular-nums' }}>{m.totalSP}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: m.bugSP > 0 ? '#FA4338' : '#C8CAD0', fontVariantNumeric: 'tabular-nums' }}>{m.bugSP || '—'}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#21944E', fontVariantNumeric: 'tabular-nums' }}>{m.capSP}</td>
                                                        <td style={{ padding: '10px 20px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--gem)', fontVariantNumeric: 'tabular-nums' }}>{fmt(m.allocatedCost)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ background: '#F6F6F9', borderTop: '2px solid #E2E4E9' }}>
                                                    <td style={{ padding: '10px 20px', fontSize: 12, fontWeight: 800, color: '#3F4450' }}>TEAM TOTAL</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#3F4450', fontVariantNumeric: 'tabular-nums' }}>{team.totalTickets}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#3F4450', fontVariantNumeric: 'tabular-nums' }}>{team.totalSP}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#FA4338', fontVariantNumeric: 'tabular-nums' }}>{team.bugSP || '—'}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#21944E', fontVariantNumeric: 'tabular-nums' }}>{team.capSP}</td>
                                                    <td style={{ padding: '10px 20px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: 'var(--gem)', fontVariantNumeric: 'tabular-nums' }}>{fmt(team.totalCost)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                        <div className="px-6 py-2.5 text-[11px] flex items-center gap-4" style={{ background: '#FAFAFA', borderTop: '1px solid #E2E4E9', color: '#A4A9B6' }}>
                                            <span>Cost / SP: <strong style={{ color: '#3F4450' }}>{fmt(team.costPerSP)}</strong></span>
                                            <span>Cap Ratio: <strong style={{ color: '#21944E' }}>{team.capRatio}%</strong></span>
                                            <span>Bug Ratio: <strong style={{ color: '#FA4338' }}>{team.bugRatio}%</strong></span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* KPI Card */
function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
    return (
        <div className="glass-card p-4 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>{icon}</div>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>{label}</span>
            </div>
            <span className="text-xl font-bold" style={{ color: '#3F4450' }}>{value}</span>
        </div>
    );
}
