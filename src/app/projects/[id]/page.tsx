'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, User, Tag, Calendar, FileText, AlertCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ProjectDetail {
    id: string;
    name: string;
    description: string;
    epicKey: string;
    status: string;
    isCapitalizable: boolean;
    amortizationMonths: number;
    accumulatedCost: number;
    startingBalance: number;
    startDate: string;
    launchDate: string | null;
    overrideReason: string | null;
    tickets: {
        id: string;
        ticketId: string;
        issueType: string;
        summary: string;
        storyPoints: number;
        resolutionDate: string | null;
        assignee: { id: string; name: string; role: string };
    }[];
    developers: {
        id: string;
        name: string;
        role: string;
        ticketCount: number;
        totalPoints: number;
        storyPoints: number;
    }[];
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PIE_COLORS = ['#21944E', '#FA4338', '#4141A2'];

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [project, setProject] = useState<ProjectDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [overrideReason, setOverrideReason] = useState('');
    const [overrideStatus, setOverrideStatus] = useState('');

    useEffect(() => {
        fetch(`/api/projects/${params.id}`)
            .then((res) => res.json())
            .then((data) => {
                setProject(data);
                setOverrideReason(data.overrideReason || '');
                setOverrideStatus(data.status);
            })
            .finally(() => setLoading(false));
    }, [params.id]);

    const saveOverride = async () => {
        await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: project?.id, status: overrideStatus, overrideReason }),
        });
        setProject((prev) => prev ? { ...prev, status: overrideStatus, overrideReason } : prev);
    };

    if (loading || !project) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    const storyTickets = project.tickets.filter((t) => t.issueType === 'STORY');
    const bugTickets = project.tickets.filter((t) => t.issueType === 'BUG');
    const taskTickets = project.tickets.filter((t) => t.issueType === 'TASK');
    const pieData = [
        { name: 'Stories', value: storyTickets.reduce((s, t) => s + t.storyPoints, 0) },
        { name: 'Bugs', value: bugTickets.reduce((s, t) => s + t.storyPoints, 0) },
        { name: 'Tasks', value: taskTickets.reduce((s, t) => s + t.storyPoints, 0) },
    ].filter((d) => d.value > 0);

    const statusColors: Record<string, string> = {
        LIVE: '#21944E', DEV: '#4141A2', PLANNING: '#D3D236', RETIRED: '#A4A9B6',
    };

    return (
        <div>
            <button onClick={() => router.back()} className="btn-ghost mb-6">
                <ArrowLeft className="w-4 h-4" /> Back to Projects
            </button>

            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="section-header">{project.name}</h1>
                        <span className="badge border" style={{ borderColor: statusColors[project.status] || '#A4A9B6', color: statusColors[project.status] || '#717684' }}>
                            {project.status}
                        </span>
                    </div>
                    <p className="section-subtext">{project.description}</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: '#3F4450' }}>{formatCurrency(project.accumulatedCost + project.startingBalance)}</p>
                    <p className="text-xs" style={{ color: '#A4A9B6' }}>Inception-to-date cost</p>
                </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="stat-card accent-gem">
                    <div className="flex items-center gap-2 mb-2"><Tag className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} /><span className="text-[10px] uppercase font-semibold" style={{ color: '#A4A9B6' }}>Epic Key</span></div>
                    <p className="text-lg font-bold font-mono" style={{ color: '#4141A2' }}>{project.epicKey}</p>
                </div>
                <div className="stat-card accent-carbon">
                    <div className="flex items-center gap-2 mb-2"><Calendar className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} /><span className="text-[10px] uppercase font-semibold" style={{ color: '#A4A9B6' }}>Start Date</span></div>
                    <p className="text-lg font-bold" style={{ color: '#3F4450' }}>{formatDate(project.startDate)}</p>
                </div>
                <div className="stat-card accent-cilantro">
                    <div className="flex items-center gap-2 mb-2"><Calendar className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} /><span className="text-[10px] uppercase font-semibold" style={{ color: '#A4A9B6' }}>Launch Date</span></div>
                    <p className="text-lg font-bold" style={{ color: '#3F4450' }}>{formatDate(project.launchDate)}</p>
                </div>
                <div className="stat-card accent-red">
                    <div className="flex items-center gap-2 mb-2"><FileText className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} /><span className="text-[10px] uppercase font-semibold" style={{ color: '#A4A9B6' }}>Amortization</span></div>
                    <p className="text-lg font-bold" style={{ color: '#3F4450' }}>{project.amortizationMonths} months</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Developers */}
                <div className="glass-card p-6 lg:col-span-2">
                    <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#3F4450' }}>
                        <User className="w-4 h-4" style={{ color: '#A4A9B6' }} /> Developer Contributions
                    </h2>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Developer</th>
                                <th>Role</th>
                                <th className="text-right">Tickets</th>
                                <th className="text-right">Story Pts</th>
                                <th className="text-right">Total Pts</th>
                            </tr>
                        </thead>
                        <tbody>
                            {project.developers.map((dev) => (
                                <tr key={dev.id}>
                                    <td className="text-sm font-medium" style={{ color: '#3F4450' }}>{dev.name}</td>
                                    <td><span className="badge" style={{ background: dev.role === 'ENG' ? '#E8F4F8' : dev.role === 'PRODUCT' ? '#F0EAF8' : '#FFF3E0', color: dev.role === 'ENG' ? '#4141A2' : dev.role === 'PRODUCT' ? '#4141A2' : '#FA4338' }}>{dev.role}</span></td>
                                    <td className="text-right">{dev.ticketCount}</td>
                                    <td className="text-right font-semibold" style={{ color: '#21944E' }}>{dev.storyPoints}</td>
                                    <td className="text-right font-semibold" style={{ color: '#3F4450' }}>{dev.totalPoints}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Ticket Breakdown Pie */}
                <div className="glass-card p-6">
                    <h2 className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Ticket Breakdown</h2>
                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                                {pieData.map((_, i) => (
                                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E4E9', borderRadius: 10, fontSize: 12 }}
                                itemStyle={{ color: '#3F4450' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-4">
                        {pieData.map((entry, i) => (
                            <div key={entry.name} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                                    <span style={{ color: '#717684' }}>{entry.name}</span>
                                </div>
                                <span className="font-semibold" style={{ color: '#3F4450' }}>{entry.value} pts</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Admin Override */}
            <div className="glass-card p-6 mb-8">
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#3F4450' }}>
                    <AlertCircle className="w-4 h-4" style={{ color: '#FA4338' }} /> Admin Override
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="form-label">Override Status</label>
                        <select
                            value={overrideStatus}
                            onChange={(e) => setOverrideStatus(e.target.value)}
                            className="form-select"
                        >
                            <option value="PLANNING">Planning (Expense)</option>
                            <option value="DEV">Development (Capitalize)</option>
                            <option value="LIVE">Live (Amortize)</option>
                            <option value="RETIRED">Retired</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="form-label">Justification</label>
                        <input
                            type="text"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="e.g. Project failed — force to Expense"
                            className="form-input"
                        />
                    </div>
                </div>
                <button onClick={saveOverride} className="btn-primary mt-4">Save Override</button>
            </div>

            {/* Tickets Table */}
            <div className="glass-card p-6">
                <h2 className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Jira Tickets ({project.tickets.length})</h2>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Ticket</th>
                            <th>Type</th>
                            <th>Summary</th>
                            <th>Assignee</th>
                            <th className="text-right">Points</th>
                            <th>Resolved</th>
                        </tr>
                    </thead>
                    <tbody>
                        {project.tickets.map((ticket) => (
                            <tr key={ticket.id}>
                                <td><span className="text-xs font-mono" style={{ color: '#4141A2' }}>{ticket.ticketId}</span></td>
                                <td>
                                    <span className="badge" style={{
                                        background: ticket.issueType === 'STORY' ? '#EBF5EF' : ticket.issueType === 'BUG' ? '#FFF5F5' : '#F0EAF8',
                                        color: ticket.issueType === 'STORY' ? '#21944E' : ticket.issueType === 'BUG' ? '#FA4338' : '#4141A2',
                                    }}>
                                        {ticket.issueType}
                                    </span>
                                </td>
                                <td className="text-sm max-w-[300px] truncate" style={{ color: '#3F4450' }}>{ticket.summary}</td>
                                <td className="text-sm">{ticket.assignee.name}</td>
                                <td className="text-right font-semibold" style={{ color: '#3F4450' }}>{ticket.storyPoints}</td>
                                <td className="text-xs" style={{ color: '#A4A9B6' }}>{formatDate(ticket.resolutionDate)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
