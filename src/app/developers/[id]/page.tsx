'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, DollarSign, GitBranch, Tag } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface DevDetail {
    id: string;
    name: string;
    email: string;
    jiraUserId: string;
    role: string;
    monthlySalary: number;
    fringeBenefitRate: number;
    stockCompAllocation: number;
    loadedCost: number;
    totalPoints: number;
    storyPoints: number;
    bugPoints: number;
    taskPoints: number;
    capPoints: number;
    capRatio: number;
    tickets: {
        id: string;
        ticketId: string;
        issueType: string;
        summary: string;
        storyPoints: number;
        resolutionDate: string | null;
        project: { id: string; name: string; epicKey: string; status: string; isCapitalizable: boolean };
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

export default function DeveloperDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [dev, setDev] = useState<DevDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/developers/${params.id}`)
            .then((res) => res.json())
            .then(setDev)
            .finally(() => setLoading(false));
    }, [params.id]);

    if (loading || !dev) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    const pieData = [
        { name: 'Features (Cap)', value: dev.capPoints },
        { name: 'Bugs (Exp)', value: dev.bugPoints },
        { name: 'Tasks', value: dev.taskPoints },
    ].filter((d) => d.value > 0);

    // Group by project for bar chart
    const projectMap: Record<string, { name: string; points: number }> = {};
    dev.tickets.forEach((t) => {
        if (!projectMap[t.project.epicKey]) {
            projectMap[t.project.epicKey] = { name: t.project.name, points: 0 };
        }
        projectMap[t.project.epicKey].points += t.storyPoints;
    });
    const projectBarData = Object.values(projectMap).sort((a, b) => b.points - a.points);

    const roleStyle = {
        background: dev.role === 'ENG' ? '#E8F4F8' : dev.role === 'PRODUCT' ? '#F0EAF8' : '#FFF3E0',
        color: dev.role === 'ENG' ? '#4141A2' : dev.role === 'PRODUCT' ? '#4141A2' : '#FA4338',
    };

    return (
        <div>
            <button onClick={() => router.back()} className="btn-ghost mb-6">
                <ArrowLeft className="w-4 h-4" /> Back to FTE & Payroll
            </button>

            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="section-header">{dev.name}</h1>
                    <p className="section-subtext">{dev.email} · Jira: {dev.jiraUserId}</p>
                </div>
                <span className="badge" style={roleStyle}>{dev.role}</span>
            </div>

            {/* Cost Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="stat-card accent-gem">
                    <div className="flex items-center gap-2 mb-2"><DollarSign className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} /><span className="text-[10px] uppercase font-semibold" style={{ color: '#A4A9B6' }}>Monthly Salary</span></div>
                    <p className="text-xl font-bold" style={{ color: '#3F4450' }}>{formatCurrency(dev.monthlySalary)}</p>
                </div>
                <div className="stat-card accent-carbon">
                    <div className="flex items-center gap-2 mb-2"><Briefcase className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} /><span className="text-[10px] uppercase font-semibold" style={{ color: '#A4A9B6' }}>Loaded Cost</span></div>
                    <p className="text-xl font-bold" style={{ color: '#3F4450' }}>{formatCurrency(dev.loadedCost)}</p>
                </div>
                <div className="stat-card accent-cilantro">
                    <div className="flex items-center gap-2 mb-2"><GitBranch className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} /><span className="text-[10px] uppercase font-semibold" style={{ color: '#A4A9B6' }}>Cap Ratio</span></div>
                    <p className="text-xl font-bold" style={{ color: '#21944E' }}>{(dev.capRatio * 100).toFixed(1)}%</p>
                </div>
                <div className="stat-card accent-red">
                    <div className="flex items-center gap-2 mb-2"><Tag className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} /><span className="text-[10px] uppercase font-semibold" style={{ color: '#A4A9B6' }}>Total Story Points</span></div>
                    <p className="text-xl font-bold" style={{ color: '#3F4450' }}>{dev.totalPoints}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Allocation Pie Chart */}
                <div className="glass-card p-6">
                    <h2 className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Effort Allocation</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                                {pieData.map((_, i) => (
                                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E4E9', borderRadius: 10, fontSize: 12 }} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-6 mt-4">
                        {pieData.map((entry, i) => (
                            <div key={entry.name} className="flex items-center gap-2 text-xs">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                                <span style={{ color: '#717684' }}>{entry.name}: {entry.value} pts</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Project Contribution Bar */}
                <div className="glass-card p-6">
                    <h2 className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Project Contribution</h2>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={projectBarData} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E4E9" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#A4A9B6' }} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#717684' }} width={130} />
                            <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E4E9', borderRadius: 10, fontSize: 12 }} />
                            <Bar dataKey="points" name="Story Points" fill="#4141A2" radius={[0, 6, 6, 0]} barSize={24} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Tickets */}
            <div className="glass-card p-6">
                <h2 className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Ticket History ({dev.tickets.length} tickets)</h2>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Ticket</th>
                            <th>Type</th>
                            <th>Summary</th>
                            <th>Project</th>
                            <th className="text-right">Points</th>
                            <th>Resolved</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dev.tickets.map((ticket) => (
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
                                <td className="text-sm max-w-[250px] truncate" style={{ color: '#3F4450' }}>{ticket.summary}</td>
                                <td className="text-xs" style={{ color: '#717684' }}>{ticket.project.name}</td>
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
