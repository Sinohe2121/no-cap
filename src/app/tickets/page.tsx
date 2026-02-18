'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, Filter } from 'lucide-react';

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
    assignee: { id: string; name: string; role: string; isActive: boolean };
    project: { id: string; name: string; status: string; epicKey: string; isCapitalizable: boolean };
    allocatedCost: number;
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
    const [tickets, setTickets] = useState<TicketData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [projectFilter, setProjectFilter] = useState<string>('ALL');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
    const [tab, setTab] = useState<'active' | 'closed'>('active');

    useEffect(() => {
        fetch('/api/tickets')
            .then((res) => res.json())
            .then(setTickets)
            .finally(() => setLoading(false));
    }, []);

    const activeTickets = useMemo(() => tickets.filter((t) => !t.resolutionDate), [tickets]);
    const closedTickets = useMemo(() => tickets.filter((t) => !!t.resolutionDate), [tickets]);
    const currentList = tab === 'active' ? activeTickets : closedTickets;

    // Unique filter options
    const projects = useMemo(() => Array.from(new Set(tickets.map((t) => t.project.name))).sort(), [tickets]);
    const assignees = useMemo(() => Array.from(new Set(tickets.map((t) => t.assignee.name))).sort(), [tickets]);

    const filtered = useMemo(() => {
        let list = currentList;
        if (search) {
            const q = search.toLowerCase();
            list = list.filter((t) =>
                t.ticketId.toLowerCase().includes(q) ||
                t.summary.toLowerCase().includes(q) ||
                t.assignee.name.toLowerCase().includes(q) ||
                t.project.name.toLowerCase().includes(q)
            );
        }
        if (typeFilter !== 'ALL') list = list.filter((t) => t.issueType === typeFilter);
        if (projectFilter !== 'ALL') list = list.filter((t) => t.project.name === projectFilter);
        if (assigneeFilter !== 'ALL') list = list.filter((t) => t.assignee.name === assigneeFilter);
        return list;
    }, [currentList, search, typeFilter, projectFilter, assigneeFilter]);

    const totalSP = filtered.reduce((s, t) => s + t.storyPoints, 0);
    const totalCost = filtered.reduce((s, t) => s + t.allocatedCost, 0);
    const hasFilters = search || typeFilter !== 'ALL' || projectFilter !== 'ALL' || assigneeFilter !== 'ALL';

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="section-header">Tickets</h1>
                <p className="section-subtext">All Jira tickets across projects — {tickets.length} total</p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 p-1 rounded-xl" style={{ background: '#F6F6F9', width: 'fit-content' }}>
                <button
                    onClick={() => setTab('active')}
                    className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{
                        background: tab === 'active' ? '#FFFFFF' : 'transparent',
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
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#A4A9B6' }} />
                        <input
                            type="text"
                            placeholder="Search by ticket ID, summary, assignee, or project..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="form-input"
                            style={{ width: '100%', color: '#3F4450', fontSize: 13, paddingLeft: 36 }}
                        />
                    </div>

                    {/* Type Filter */}
                    <div className="flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} />
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

                    {hasFilters && (
                        <button
                            onClick={() => { setSearch(''); setTypeFilter('ALL'); setProjectFilter('ALL'); setAssigneeFilter('ALL'); }}
                            className="btn-ghost text-xs"
                            style={{ color: '#FA4338' }}
                        >
                            <X className="w-3.5 h-3.5" /> Clear
                        </button>
                    )}
                </div>

                {/* Summary bar */}
                <div className="flex items-center gap-6 mt-3 pt-3" style={{ borderTop: '1px solid #E2E4E9' }}>
                    <span className="text-xs" style={{ color: '#A4A9B6' }}>
                        <span className="font-semibold" style={{ color: '#3F4450' }}>{filtered.length}</span> tickets
                    </span>
                    <span className="text-xs" style={{ color: '#A4A9B6' }}>
                        <span className="font-semibold" style={{ color: '#4141A2' }}>{totalSP}</span> story points
                    </span>
                    <span className="text-xs" style={{ color: '#A4A9B6' }}>
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
                                <th className="text-right">Story Pts</th>
                                <th className="text-right">Allocated Cost</th>
                                <th>Fix Version</th>
                                {tab === 'closed' && <th>Resolved</th>}
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={tab === 'closed' ? 10 : 9} className="text-center" style={{ padding: '40px 0', color: '#A4A9B6' }}>
                                        No tickets found
                                    </td>
                                </tr>
                            )}
                            {filtered.map((t) => {
                                const typeStyle = issueTypeStyle[t.issueType] || issueTypeStyle['TASK'];
                                return (
                                    <tr key={t.id}>
                                        <td>
                                            <span className="font-mono text-xs font-semibold" style={{ color: '#4141A2' }}>{t.ticketId}</span>
                                        </td>
                                        <td>
                                            <span className="text-xs" style={{ color: '#3F4450', maxWidth: 320, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {t.summary}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="badge" style={{ background: typeStyle.bg, color: typeStyle.color }}>
                                                {t.issueType}
                                            </span>
                                        </td>
                                        <td>
                                            <Link href={`/projects/${t.project.id}`} className="text-xs font-medium" style={{ color: '#717684', textDecoration: 'none' }}>
                                                {t.project.name}
                                            </Link>
                                        </td>
                                        <td className="text-xs" style={{ color: '#717684' }}>{t.assignee.name}</td>
                                        <td className="text-right text-xs font-semibold" style={{ color: '#3F4450' }}>{t.storyPoints}</td>
                                        <td className="text-right text-xs font-semibold" style={{ color: t.allocatedCost > 0 ? '#21944E' : '#A4A9B6' }}>
                                            {t.allocatedCost > 0 ? formatCurrency(t.allocatedCost) : '—'}
                                        </td>
                                        <td className="text-xs" style={{ color: '#A4A9B6' }}>{t.fixVersion || '—'}</td>
                                        {tab === 'closed' && (
                                            <td className="text-xs" style={{ color: '#717684' }}>
                                                {t.resolutionDate ? formatDate(t.resolutionDate) : '—'}
                                            </td>
                                        )}
                                        <td className="text-xs" style={{ color: '#A4A9B6' }}>{formatDate(t.createdAt)}</td>
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
