'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Briefcase, DollarSign, GitBranch, Tag, Pencil, X, Check } from 'lucide-react';
import { PIE_COLORS, TOOLTIP_STYLE } from '@/lib/chartColors';
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
    isActive: boolean;
    loadedCost: number;
    totalSalary: number;
    totalFringe: number;
    totalSbc: number;
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
        appliedSP: number;
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

// PIE_COLORS imported from @/lib/chartColors

export default function DeveloperDetailPage() {
    const params = useParams();
    const [dev, setDev] = useState<DevDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [form, setForm] = useState({
        name: '',
        email: '',
        jiraUserId: '',
        role: 'ENG',
        monthlySalary: '',
        stockCompAllocation: '',
        fringeBenefitRate: '',
        isActive: true,
    });

    useEffect(() => {
        fetch(`/api/developers/${params.id}`)
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                setDev(data);
                setForm({
                    name: data.name,
                    email: data.email,
                    jiraUserId: data.jiraUserId,
                    role: data.role,
                    monthlySalary: String(data.monthlySalary),
                    stockCompAllocation: String(data.stockCompAllocation),
                    fringeBenefitRate: String((data.fringeBenefitRate * 100).toFixed(1)),
                    isActive: data.isActive,
                });
            })
            .finally(() => setLoading(false));
    }, [params.id]);

    const handleSave = async () => {
        setSaving(true);
        setSaveError('');
        try {
            const res = await fetch(`/api/developers/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    email: form.email,
                    jiraUserId: form.jiraUserId,
                    role: form.role,
                    monthlySalary: parseFloat(form.monthlySalary),
                    stockCompAllocation: parseFloat(form.stockCompAllocation),
                    fringeBenefitRate: parseFloat(form.fringeBenefitRate) / 100,
                    isActive: form.isActive,
                }),
            });
            if (!res.ok) throw new Error('Save failed');
            // Reload the full computed record
            const refreshed = await fetch(`/api/developers/${params.id}`).then((r) => r.json());
            setDev(refreshed);
            setForm((f) => ({ ...f, fringeBenefitRate: String((refreshed.fringeBenefitRate * 100).toFixed(1)) }));
            setEditing(false);
        } catch {
            setSaveError('Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (loading || !dev) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    const pieData = [
        { name: 'Features (Cap)', value: dev.capPoints },
        { name: 'Bugs (Exp)', value: dev.bugPoints },
        { name: 'Tasks', value: dev.taskPoints },
    ].filter((d) => d.value > 0);

    const projectMap: Record<string, { name: string; points: number }> = {};
    dev.tickets.forEach((t) => {
        if (!projectMap[t.project.epicKey]) {
            projectMap[t.project.epicKey] = { name: t.project.name, points: 0 };
        }
        projectMap[t.project.epicKey].points += t.appliedSP;
    });
    const projectBarData = Object.values(projectMap).sort((a, b) => b.points - a.points);

    const roleStyle = {
        background: dev.role === 'ENG' ? '#E8F4F8' : dev.role === 'PRODUCT' ? '#F0EAF8' : '#FFF3E0',
        color: dev.role === 'ENG' ? '#4141A2' : dev.role === 'PRODUCT' ? '#4141A2' : '#FA4338',
    };

    const computedLoaded = dev.loadedCost || 0;

    return (
        <div>
            <Link href="/developers" className="btn-ghost mb-6">
                <ArrowLeft className="w-4 h-4" /> Back to FTE & Payroll
            </Link>

            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="section-header">{dev.name}</h1>
                    <p className="section-subtext">{dev.email} · Jira: {dev.jiraUserId}</p>
                </div>
                <div className="flex items-center gap-3">
                    {!dev.isActive && (
                        <span className="badge" style={{ background: '#FFF3E0', color: '#FA4338' }}>Inactive</span>
                    )}
                    <span className="badge" style={roleStyle}>{dev.role}</span>
                    {!editing && (
                        <button className="btn-secondary flex items-center gap-2" onClick={() => setEditing(true)}>
                            <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                    )}
                </div>
            </div>

            {/* Edit Panel */}
            {editing && (
                <div className="glass-card p-6 mb-8" style={{ border: '1px solid #4141A2' }}>
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Edit Developer Record</h2>
                        <button onClick={() => { setEditing(false); setSaveError(''); }} className="btn-ghost p-1">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: '#717684' }}>Full Name</label>
                            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: '#717684' }}>Email</label>
                            <input className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: '#717684' }}>Jira User ID</label>
                            <input className="form-input" value={form.jiraUserId} onChange={(e) => setForm({ ...form, jiraUserId: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: '#717684' }}>Role</label>
                            <select className="form-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                                <option value="ENG">Engineer</option>
                                <option value="PRODUCT">Product</option>
                                <option value="DESIGN">Design</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: '#717684' }}>Monthly Salary ($)</label>
                            <input className="form-input" type="number" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: '#717684' }}>Stock Comp / Month ($)</label>
                            <input className="form-input" type="number" value={form.stockCompAllocation} onChange={(e) => setForm({ ...form, stockCompAllocation: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: '#717684' }}>Fringe Benefit Rate (%)</label>
                            <input className="form-input" type="number" step="0.1" value={form.fringeBenefitRate} onChange={(e) => setForm({ ...form, fringeBenefitRate: e.target.value })} />
                            <p className="text-[11px] mt-1" style={{ color: '#A4A9B6' }}>e.g. 28 = 28%  ·  Overrides the global default for this person</p>
                        </div>
                        <div className="flex flex-col justify-center">
                            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: '#717684' }}>Status</label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div
                                    className="relative w-11 h-6 rounded-full transition-colors"
                                    style={{ background: form.isActive ? '#21944E' : '#E2E4E9' }}
                                    onClick={() => setForm({ ...form, isActive: !form.isActive })}
                                >
                                    <div
                                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all"
                                        style={{ left: form.isActive ? '24px' : '4px' }}
                                    />
                                </div>
                                <span className="text-sm font-medium" style={{ color: '#3F4450' }}>
                                    {form.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Preview new loaded cost */}
                    <div className="rounded-xl p-4 mb-4" style={{ background: '#F6F6F9' }}>
                        <p className="text-xs" style={{ color: '#717684' }}>
                            Preview loaded cost with these values:{'  '}
                            <strong style={{ color: '#3F4450' }}>
                                {formatCurrency(
                                    (parseFloat(form.monthlySalary) || 0) * (1 + (parseFloat(form.fringeBenefitRate) || 0) / 100)
                                    + (parseFloat(form.stockCompAllocation) || 0)
                                )}
                                /mo
                            </strong>
                            {'  '}= ${form.monthlySalary} salary + {form.fringeBenefitRate}% fringe + ${form.stockCompAllocation} stock
                        </p>
                    </div>

                    {saveError && <p className="text-sm mb-3" style={{ color: '#FA4338' }}>{saveError}</p>}

                    <div className="flex gap-3">
                        <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saving}>
                            <Check className="w-3.5 h-3.5" />
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button className="btn-secondary" onClick={() => { setEditing(false); setSaveError(''); }}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Cost Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
                <div className="stat-card accent-carbon">
                    <div className="flex items-center gap-2 mb-2"><Briefcase className="w-3.5 h-3.5" style={{ color: '#A4A9B6' }} /><span className="text-[10px] uppercase font-semibold" style={{ color: '#A4A9B6' }}>Loaded Cost</span></div>
                    <p className="text-xl font-bold" style={{ color: '#3F4450' }}>{formatCurrency(computedLoaded)}</p>
                    <p className="text-[11px] mt-1" style={{ color: '#A4A9B6' }}>{formatCurrency(dev.totalSalary || 0)} salary + {formatCurrency(dev.totalFringe || 0)} fringe + {formatCurrency(dev.totalSbc || 0)} SBC</p>
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
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
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
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
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
                            <th>Project</th>
                            <th>Type</th>
                            <th>Summary</th>
                            <th className="text-right">JIRA SP</th>
                            <th className="text-right">Applied SP</th>
                            <th>Resolved</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dev.tickets.map((ticket) => (
                            <tr key={ticket.id}>
                                <td><span className="text-xs font-mono" style={{ color: '#4141A2' }}>{ticket.ticketId}</span></td>
                                <td className="text-xs" style={{ color: '#717684', whiteSpace: 'nowrap' }}>{ticket.project.name}</td>
                                <td>
                                    <span className="badge" style={{
                                        background: ticket.issueType === 'STORY' ? '#EBF5EF' : ticket.issueType === 'BUG' ? '#FFF5F5' : '#F0EAF8',
                                        color: ticket.issueType === 'STORY' ? '#21944E' : ticket.issueType === 'BUG' ? '#FA4338' : '#4141A2',
                                    }}>
                                        {ticket.issueType}
                                    </span>
                                </td>
                                <td className="text-sm" style={{ color: '#3F4450', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.summary}</td>
                                <td className="text-right font-semibold" style={{ color: '#717684', whiteSpace: 'nowrap' }}>{ticket.storyPoints || '—'}</td>
                                <td className="text-right font-bold" style={{ color: ticket.appliedSP !== ticket.storyPoints ? '#4141A2' : '#3F4450', whiteSpace: 'nowrap' }}>
                                    {ticket.appliedSP}
                                </td>
                                <td className="text-xs" style={{ color: '#A4A9B6', whiteSpace: 'nowrap' }}>{formatDate(ticket.resolutionDate)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
