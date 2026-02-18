'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ticket, Bug, CheckSquare, ListTodo, Search, X } from 'lucide-react';

interface Assignee {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface JiraTicket {
    id: string;
    ticketId: string;
    epicKey: string;
    issueType: string;
    summary: string;
    storyPoints: number;
    resolutionDate: string | null;
    fixVersion: string | null;
    createdAt: string;
    assignee: Assignee;
}

interface ProjectInfo {
    id: string;
    name: string;
    epicKey: string;
    status: string;
}

interface TicketData {
    project: ProjectInfo;
    tickets: JiraTicket[];
    summary: {
        totalTickets: number;
        totalStoryPoints: number;
        stories: number;
        bugs: number;
        tasks: number;
    };
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const issueTypeConfig: Record<string, { icon: typeof Ticket; bg: string; color: string; label: string }> = {
    STORY: { icon: CheckSquare, bg: '#EBF5EF', color: '#21944E', label: 'Story' },
    BUG: { icon: Bug, bg: '#FFF5F5', color: '#FA4338', label: 'Bug' },
    TASK: { icon: ListTodo, bg: '#F0EAF8', color: '#4141A2', label: 'Task' },
};

export default function ProjectTicketsPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [data, setData] = useState<TicketData | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');

    useEffect(() => {
        fetch(`/api/projects/${projectId}/tickets`)
            .then((res) => res.json())
            .then(setData)
            .finally(() => setLoading(false));
    }, [projectId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-20">
                <p className="text-sm" style={{ color: '#A4A9B6' }}>Failed to load tickets.</p>
                <Link href="/projects" className="btn-ghost text-xs mt-4 inline-flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> Back to Projects
                </Link>
            </div>
        );
    }

    // Get unique assignees for filter
    const uniqueAssignees = Array.from(
        new Map(data.tickets.map((t) => [t.assignee.id, t.assignee])).values()
    ).sort((a, b) => a.name.localeCompare(b.name));

    // Apply filters
    const filtered = data.tickets.filter((ticket) => {
        if (typeFilter !== 'ALL' && ticket.issueType !== typeFilter) return false;
        if (assigneeFilter !== 'ALL' && ticket.assignee.id !== assigneeFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                ticket.ticketId.toLowerCase().includes(q) ||
                ticket.summary.toLowerCase().includes(q) ||
                ticket.assignee.name.toLowerCase().includes(q)
            );
        }
        return true;
    });

    const filteredSP = filtered.reduce((s, t) => s + t.storyPoints, 0);

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <Link href="/projects" className="text-xs flex items-center gap-1 mb-2" style={{ color: '#A4A9B6' }}>
                        <ArrowLeft className="w-3 h-3" /> Projects
                    </Link>
                    <h1 className="section-header">{data.project.name} — Tickets</h1>
                    <p className="section-subtext">
                        Epic <span className="font-mono" style={{ color: '#4141A2' }}>{data.project.epicKey}</span> · {data.summary.totalTickets} tickets · {data.summary.totalStoryPoints} SP
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="badge text-[10px]" style={{ background: '#EBF5EF', color: '#21944E' }}>
                            {data.summary.stories} Stories
                        </span>
                        <span className="badge text-[10px]" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                            {data.summary.bugs} Bugs
                        </span>
                        <span className="badge text-[10px]" style={{ background: '#F0EAF8', color: '#4141A2' }}>
                            {data.summary.tasks} Tasks
                        </span>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-card p-4 mb-4">
                <div className="flex items-center gap-4">
                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#A4A9B6' }} />
                        <input
                            type="text"
                            placeholder="Search tickets..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="form-input pl-9 text-xs"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#A4A9B6' }}>
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {/* Type filter */}
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="form-input text-xs"
                        style={{ width: 'auto' }}
                    >
                        <option value="ALL">All Types</option>
                        <option value="STORY">Stories</option>
                        <option value="BUG">Bugs</option>
                        <option value="TASK">Tasks</option>
                    </select>

                    {/* Assignee filter */}
                    <select
                        value={assigneeFilter}
                        onChange={(e) => setAssigneeFilter(e.target.value)}
                        className="form-input text-xs"
                        style={{ width: 'auto' }}
                    >
                        <option value="ALL">All Assignees</option>
                        {uniqueAssignees.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>

                    {/* Count */}
                    <span className="text-xs" style={{ color: '#A4A9B6' }}>
                        {filtered.length} ticket{filtered.length !== 1 ? 's' : ''} · {filteredSP} SP
                    </span>
                </div>
            </div>

            {/* Tickets Table */}
            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Ticket</th>
                            <th>Type</th>
                            <th>Summary</th>
                            <th>Assignee</th>
                            <th className="text-right">SP</th>
                            <th>Version</th>
                            <th>Resolved</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((ticket) => {
                            const cfg = issueTypeConfig[ticket.issueType] || issueTypeConfig.TASK;
                            const Icon = cfg.icon;
                            return (
                                <tr key={ticket.id}>
                                    <td>
                                        <span className="text-xs font-mono font-semibold" style={{ color: '#4141A2' }}>
                                            {ticket.ticketId}
                                        </span>
                                    </td>
                                    <td>
                                        <span
                                            className="badge text-[10px] inline-flex items-center gap-1"
                                            style={{ background: cfg.bg, color: cfg.color }}
                                        >
                                            <Icon className="w-3 h-3" />
                                            {cfg.label}
                                        </span>
                                    </td>
                                    <td>
                                        <p className="text-xs" style={{ color: '#3F4450', maxWidth: 320 }}>
                                            {ticket.summary}
                                        </p>
                                    </td>
                                    <td>
                                        <div>
                                            <p className="text-xs font-medium" style={{ color: '#3F4450' }}>{ticket.assignee.name}</p>
                                            <p className="text-[10px]" style={{ color: '#A4A9B6' }}>{ticket.assignee.role}</p>
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <span className="text-sm font-semibold tabular-nums" style={{ color: '#3F4450' }}>
                                            {ticket.storyPoints}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="text-xs" style={{ color: '#717684' }}>
                                            {ticket.fixVersion || '—'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="text-xs" style={{ color: ticket.resolutionDate ? '#21944E' : '#A4A9B6' }}>
                                            {formatDate(ticket.resolutionDate)}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <p className="text-center py-8 text-xs" style={{ color: '#A4A9B6' }}>
                        No tickets match your filters
                    </p>
                )}
            </div>
        </div>
    );
}
