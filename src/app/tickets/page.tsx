'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X, Filter, ArrowLeft, Calendar } from 'lucide-react';
import { JiraTicketLink } from '@/components/JiraTicketPanel';
import { usePeriod } from '@/context/PeriodContext';

interface TicketData {
    id: string;
    ticketId: string;
    epicKey: string;
    issueType: string;
    summary: string;
    storyPoints: number;
    resolutionDate: string | null;
    fixVersion: string | null;
    createdAt: string;
    customFields: Record<string, any> | null;
    assignee: { id: string; name: string; role: string; isActive: boolean } | null;
    project: { id: string; name: string; status: string; epicKey: string; isCapitalizable: boolean } | null;
    allocatedCost: number;
    allocatedAmount: number;
    amortizationMonths: number;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const issueTypeStyle: Record<string, { bg: string; color: string }> = {
    STORY: { bg: '#EBF5EF', color: '#21944E' },
    BUG: { bg: '#FFF5F5', color: '#FA4338' },
    TASK: { bg: '#F0EAF8', color: '#4141A2' },
};

export default function TicketsPage() {
    const router = useRouter();
    const [tickets, setTickets] = useState<TicketData[]>([]);
    const [bugSpFallback, setBugSpFallback]   = useState(1);
    const [otherSpFallback, setOtherSpFallback] = useState(1);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [projectFilter, setProjectFilter] = useState<string>('ALL');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
    const [hasStoryPoints, setHasStoryPoints] = useState(false);
    const [hasAllocatedCost, setHasAllocatedCost] = useState(false);
    const [tab, setTab] = useState<'active' | 'closed'>('active');
    const { apiParams, label: periodLabel, preset } = usePeriod();

    useEffect(() => {
        // Honor the global Reporting Period filter from the sidebar so the
        // list matches the count shown on the hub tile that linked here.
        // The API filters by Jira "Created" date when start/end are passed.
        setLoading(true);
        const url = apiParams ? `/api/tickets?${apiParams}` : '/api/tickets';
        fetch(url)
            .then((res) => res.ok ? res.json() : { tickets: [] })
            .then((data) => {
                setTickets(data.tickets ?? []);
                if (typeof data.bugSpFallback === 'number')  setBugSpFallback(data.bugSpFallback);
                if (typeof data.otherSpFallback === 'number') setOtherSpFallback(data.otherSpFallback);
            })
            .finally(() => setLoading(false));
    }, [apiParams]);

    const activeTickets = useMemo(() => tickets.filter((t) => !t.resolutionDate), [tickets]);
    const closedTickets = useMemo(() => tickets.filter((t) => !!t.resolutionDate), [tickets]);
    const currentList = tab === 'active' ? activeTickets : closedTickets;

    // Unique filter options
    const projects = useMemo(() => Array.from(new Set(tickets.map((t) => t.project?.name || 'Unlinked'))).sort(), [tickets]);
    const assignees = useMemo(() => Array.from(new Set(tickets.map((t) => t.assignee?.name || 'Unassigned'))).sort(), [tickets]);

    const filtered = useMemo(() => {
        let list = currentList;
        if (search) {
            const q = search.toLowerCase();
            list = list.filter((t) =>
                t.ticketId.toLowerCase().includes(q) ||
                t.summary.toLowerCase().includes(q) ||
                (t.assignee?.name || '').toLowerCase().includes(q) ||
                (t.project?.name || '').toLowerCase().includes(q)
            );
        }
        if (typeFilter !== 'ALL') list = list.filter((t) => t.issueType === typeFilter);
        if (projectFilter !== 'ALL') list = list.filter((t) => (t.project?.name || 'Unlinked') === projectFilter);
        if (assigneeFilter !== 'ALL') list = list.filter((t) => (t.assignee?.name || 'Unassigned') === assigneeFilter);
        if (hasStoryPoints) list = list.filter((t) => t.storyPoints > 0);
        if (hasAllocatedCost) list = list.filter((t) => t.allocatedCost > 0);
        return list;
    }, [currentList, search, typeFilter, projectFilter, assigneeFilter, hasStoryPoints, hasAllocatedCost]);

    const getAppliedSP = (t: TicketData) =>
        t.storyPoints > 0 ? t.storyPoints : (t.issueType === 'BUG' ? bugSpFallback : otherSpFallback);

    const totalSP = filtered.reduce((s, t) => s + t.storyPoints, 0);
    const totalAppliedSP = filtered.reduce((s, t) => s + getAppliedSP(t), 0);
    const totalCost = filtered.reduce((s, t) => s + t.allocatedCost, 0);
    const hasFilters = search || typeFilter !== 'ALL' || projectFilter !== 'ALL' || assigneeFilter !== 'ALL' || hasStoryPoints || hasAllocatedCost;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--envoy-red)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-4">
                <Link href="/projects" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline" style={{ color: 'var(--envoy-red)' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Projects
                </Link>
            </div>
            <div className="mb-6">
                <p className="eyebrow" style={{ color: 'var(--envoy-red)', letterSpacing: '0.1em', marginBottom: 4 }}>
                    Projects & Tickets
                </p>
                <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
                    Tickets Tracker
                </h1>
                <p style={{ fontSize: 14, color: 'var(--fg-2)', marginTop: 6, maxWidth: 720 }}>
                    {preset === 'all_time'
                        ? <>All Jira tickets across projects — {tickets.length} total.</>
                        : <>Showing tickets created in <strong>{periodLabel}</strong> — {tickets.length} match. Change the Reporting Period in the sidebar to widen the range.</>}
                </p>
            </div>
            {preset !== 'all_time' && (
                <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: '#FFEFEE', color: 'var(--envoy-red)', border: '1px solid rgba(250,67,56,0.2)' }}>
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Filtered by <strong>{periodLabel}</strong> from the sidebar</span>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-page)', width: 'fit-content' }}>
                <button
                    onClick={() => setTab('active')}
                    className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{
                        background: tab === 'active' ? 'var(--bg-surface)' : 'transparent',
                        color: tab === 'active' ? '#3F4450' : '#A4A9B6',
                        boxShadow: tab === 'active' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                >
                    Active ({activeTickets.length})
                </button>
                <button
                    onClick={() => setTab('closed')}
                    className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{
                        background: tab === 'closed' ? '#FFFFFF' : 'transparent',
                        color: tab === 'closed' ? '#3F4450' : '#A4A9B6',
                        boxShadow: tab === 'closed' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                >
                    Closed ({closedTickets.length})
                </button>
            </div>

            {/* Search and Filters */}
            <div className="glass-card p-4 mb-6">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1" style={{ minWidth: 240 }}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--fg-3)' }} />
                        <input
                            type="text"
                            placeholder="Search by ticket ID, summary, assignee, or project..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="form-input"
                            style={{ width: '100%', color: 'var(--fg-1)', fontSize: 13, paddingLeft: 36 }}
                        />
                    </div>

                    {/* Type Filter */}
                    <div className="flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5" style={{ color: 'var(--fg-3)' }} />
                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="form-select" style={{ width: 120 }}>
                            <option value="ALL">All Types</option>
                            <option value="STORY">Story</option>
                            <option value="BUG">Bug</option>
                            <option value="TASK">Task</option>
                        </select>
                    </div>

                    {/* Project Filter */}
                    <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="form-select" style={{ width: 180 }}>
                        <option value="ALL">All Projects</option>
                        {projects.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>

                    {/* Assignee Filter */}
                    <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="form-select" style={{ width: 160 }}>
                        <option value="ALL">All Assignees</option>
                        {assignees.map((a) => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>

                    {/* Toggle Filters */}
                    <button
                        onClick={() => setHasStoryPoints(!hasStoryPoints)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                            background: hasStoryPoints ? '#4141A2' : '#F6F6F9',
                            color: hasStoryPoints ? '#FFFFFF' : '#717684',
                            border: `1px solid ${hasStoryPoints ? '#4141A2' : '#E2E4E9'}`,
                        }}
                    >
                        Has Story Points
                    </button>
                    <button
                        onClick={() => setHasAllocatedCost(!hasAllocatedCost)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                            background: hasAllocatedCost ? '#21944E' : '#F6F6F9',
                            color: hasAllocatedCost ? '#FFFFFF' : '#717684',
                            border: `1px solid ${hasAllocatedCost ? '#21944E' : '#E2E4E9'}`,
                        }}
                    >
                        Has Allocated Cost
                    </button>

                    {hasFilters && (
                        <button
                            onClick={() => { setSearch(''); setTypeFilter('ALL'); setProjectFilter('ALL'); setAssigneeFilter('ALL'); setHasStoryPoints(false); setHasAllocatedCost(false); }}
                            className="btn-ghost text-xs"
                            style={{ color: '#FA4338' }}
                        >
                            <X className="w-3.5 h-3.5" /> Clear
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-6 mt-3 pt-3" style={{ borderTop: '1px solid #E2E4E9' }}>
                    <span className="text-xs" style={{ color: 'var(--fg-3)' }}>
                        <span className="font-semibold" style={{ color: 'var(--fg-1)' }}>{filtered.length}</span> tickets
                    </span>
                    <span className="text-xs" style={{ color: 'var(--fg-3)' }}>
                        Jira SP: <span className="font-semibold" style={{ color: 'var(--fg-2)' }}>{totalSP}</span>
                    </span>
                    <span className="text-xs" style={{ color: 'var(--fg-3)' }}>
                        Applied SP: <span className="font-semibold" style={{ color: '#4141A2' }}>{totalAppliedSP}</span>
                    </span>
                    <span className="text-xs" style={{ color: 'var(--fg-3)' }}>
                        <span className="font-semibold" style={{ color: '#21944E' }}>{formatCurrency(totalCost)}</span> allocated cost
                    </span>
                </div>
            </div>

            {/* Tickets Table */}
            <div className="glass-card overflow-hidden">
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Ticket ID</th>
                                <th>Summary</th>
                                <th>Type</th>
                                <th>Project</th>
                                <th>Assignee</th>
                                <th className="text-right">Jira SP</th>
                                <th className="text-right">Applied SP</th>
                                <th className="text-right">Allocated Cost</th>
                                <th>Resolved</th>
                                <th>Depr. Start</th>
                                <th className="text-right">Depr. Amount</th>
                                <th>Fix Version</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={13} className="text-center" style={{ padding: '40px 0', color: 'var(--fg-3)' }}>
                                        No tickets found
                                    </td>
                                </tr>
                            )}
                            {filtered.map((t) => {
                                const typeStyle = issueTypeStyle[t.issueType] || issueTypeStyle['TASK'];
                                return (
                                    <tr key={t.id} onClick={() => router.push(`/tickets/${t.id}`)} style={{ cursor: 'pointer' }}>
                                        <td>
                                            <JiraTicketLink
                                                ticketId={t.ticketId}
                                                style={{ fontSize: 12, fontWeight: 700, color: '#4141A2' }}
                                            />
                                        </td>
                                        <td>
                                            <span className="text-xs" style={{ color: 'var(--fg-1)', maxWidth: 320, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {t.summary}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="badge" style={{ background: typeStyle.bg, color: typeStyle.color }}>
                                                {t.issueType}
                                            </span>
                                        </td>
                                        <td>
                                            {t.project ? (
                                                <Link href={`/projects/${t.project.id}`} className="text-xs font-medium" style={{ color: 'var(--fg-2)', textDecoration: 'none' }}>
                                                    {t.project.name}
                                                </Link>
                                            ) : (
                                                <span className="text-xs" style={{ color: 'var(--fg-3)' }}>—</span>
                                            )}
                                        </td>
                                        <td className="text-xs" style={{ color: 'var(--fg-2)' }}>{t.assignee?.name || 'Unassigned'}</td>
                                        {/* Jira SP — raw from import */}
                                        <td className="text-right text-xs font-semibold" style={{ color: t.storyPoints > 0 ? '#3F4450' : '#A4A9B6' }}>
                                            {t.storyPoints}
                                        </td>
                                        {/* Applied SP — uses fallback when Jira SP is 0 */}
                                        {(() => {
                                            const applied = getAppliedSP(t);
                                            const isFallback = t.storyPoints === 0;
                                            return (
                                                <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                                                    <span
                                                        className="text-xs font-semibold"
                                                        style={{ color: isFallback ? '#7B61FF' : '#3F4450' }}
                                                        title={isFallback ? `Fallback applied (Jira SP was 0)` : 'From Jira'}
                                                    >
                                                        {applied}
                                                    </span>
                                                    {isFallback && (
                                                        <span
                                                            className="ml-1 text-[10px] font-bold uppercase px-1 py-0.5 rounded"
                                                            style={{ background: '#F3F0FF', color: '#7B61FF' }}
                                                        >
                                                            est
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })()}
                                        <td className="text-right text-xs font-semibold" style={{ color: t.allocatedCost > 0 ? '#21944E' : '#A4A9B6' }}>
                                            {t.allocatedCost > 0 ? formatCurrency(t.allocatedCost) : '—'}
                                        </td>
                                        <td className="text-xs" style={{ color: 'var(--fg-2)' }}>
                                            {t.resolutionDate ? formatDate(t.resolutionDate) : '—'}
                                        </td>
                                        <td className="text-xs" style={{ color: 'var(--fg-2)' }}>
                                            {t.resolutionDate ? (() => {
                                                const rd = new Date(t.resolutionDate!);
                                                const depStart = new Date(rd.getFullYear(), rd.getMonth() + 1, 1);
                                                return depStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                            })() : '—'}
                                        </td>
                                        <td className="text-right text-xs font-semibold" style={{ color: (t.allocatedCost > 0 && t.resolutionDate && t.project?.isCapitalizable) ? '#4141A2' : '#A4A9B6' }}>
                                            {t.allocatedCost > 0 && t.resolutionDate && t.project?.isCapitalizable && t.amortizationMonths > 0
                                                ? formatCurrency(t.allocatedCost / t.amortizationMonths)
                                                : '—'}
                                        </td>
                                        <td className="text-xs" style={{ color: 'var(--fg-3)' }}>{t.fixVersion || '—'}</td>
                                        <td className="text-xs" style={{ color: 'var(--fg-3)' }}>{formatDate(t.customFields?.Created || t.createdAt)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}
