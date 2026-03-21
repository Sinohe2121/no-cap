'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, User, Tag, Calendar, FileText, AlertCircle, ShieldCheck,
    TrendingDown, Pencil, X, HelpCircle, Save, RotateCcw,
    LayoutDashboard, Users, Ticket, BarChart3, ClipboardList,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PIE_COLORS, TOOLTIP_STYLE } from '@/lib/chartColors';
import { formatCurrency, formatDate } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

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
    startingAmortization?: number;
    startDate: string;
    launchDate: string | null;
    overrideReason: string | null;
    mgmtAuthorized: boolean;
    probableToComplete: boolean;
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

interface AmortRow {
    month: number;
    year: number;
    label: string;
    charge: number;
    isOverridden: boolean;
    accumulated: number;
    nbv: number;
    opening: number;
    isFuture: boolean;
}

interface AmortData {
    rows: AmortRow[];
    costBasis: number;
    defaultMonthly: number;
    hasOverrides: boolean;
}

interface AuditEntry {
    id: string;
    entryType: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    description: string;
    period: { month: number; year: number };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_COLORS: Record<string, string> = {
    LIVE: '#21944E', DEV: '#4141A2', PLANNING: '#D3A236', RETIRED: '#A4A9B6',
};

const TABS = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'developers', label: 'Developers', icon: Users },
    { id: 'tickets', label: 'Tickets', icon: Ticket },
    { id: 'amortization', label: 'Amortization', icon: BarChart3 },
    { id: 'audit', label: 'Audit Trail', icon: ClipboardList },
];

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();

    const [project, setProject] = useState<ProjectDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    // Amort data (shared between header metric cards & Amortization tab)
    const [amortData, setAmortData] = useState<AmortData | null>(null);

    useEffect(() => {
        fetch(`/api/projects/${params.id}`)
            .then((res) => res.json())
            .then(setProject)
            .finally(() => setLoading(false));
    }, [params.id]);

    const loadAmort = useCallback(() => {
        fetch(`/api/projects/${params.id}/amortization`)
            .then((r) => r.json())
            .then(setAmortData);
    }, [params.id]);

    useEffect(() => { loadAmort(); }, [loadAmort]);

    if (loading || !project) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    // Compute header metrics
    const totalCost = project.accumulatedCost + project.startingBalance;
    const startingAmort = project.startingAmortization ?? 0;
    const elapsed = amortData?.rows.filter(r => !r.isFuture).length ?? 0;
    const totalAmortized = amortData?.rows.slice(0, elapsed).reduce((s, r) => s + r.charge, 0) ?? 0;
    const nbv = Math.max(0, totalCost - startingAmort - totalAmortized);
    const remainingCost = Math.max(0, totalCost - startingAmort);
    const monthlyCharge = amortData?.defaultMonthly
        || (remainingCost > 0 && project.amortizationMonths > 0
            ? remainingCost / project.amortizationMonths
            : 0);
    const amortStartLabel = project.launchDate
        ? (() => { const d = new Date(project.launchDate); return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`; })()
        : null;

    return (
        <div>
            {/* Breadcrumb */}
            <div className="mb-4">
                <Link href="/projects" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Projects
                </Link>
            </div>

            {/* ── Persistent Header ──────────────────────────────────────── */}
            <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="section-header" style={{ marginBottom: 0 }}>{project.name}</h1>
                        <span className="badge border text-xs font-bold" style={{ borderColor: STATUS_COLORS[project.status] || '#A4A9B6', color: STATUS_COLORS[project.status] || '#717684' }}>
                            {project.status}
                        </span>
                    </div>
                    {project.description && (
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>{project.description}</p>
                    )}
                </div>

                {/* 3 Financial Metric Cards */}
                <div className="flex items-stretch gap-3">
                    <div className="rounded-xl px-5 py-3" style={{ background: '#EBF5EF', border: '1px solid rgba(33,148,78,0.15)', minWidth: 160 }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#717684' }}>Accumulated Cost</p>
                        <p className="text-xl font-bold tabular-nums" style={{ color: '#21944E' }}>{formatCurrency(totalCost)}</p>
                    </div>
                    <div className="rounded-xl px-5 py-3" style={{ background: '#F6F6F9', border: '1px solid #E2E4E9', minWidth: 160 }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#717684' }}>Net Book Value</p>
                        <p className="text-xl font-bold tabular-nums" style={{ color: '#3F4450' }}>{formatCurrency(nbv)}</p>
                        {elapsed > 0 && <p className="text-[10px]" style={{ color: '#A4A9B6' }}>After {elapsed} months</p>}
                    </div>
                    <div className="rounded-xl px-5 py-3" style={{ background: '#F0EAF8', border: '1px solid rgba(65,65,162,0.15)', minWidth: 160 }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#717684' }}>Monthly Amortization</p>
                        <p className="text-xl font-bold tabular-nums" style={{ color: '#4141A2' }}>{formatCurrency(monthlyCharge)}</p>
                        {amortStartLabel && <p className="text-[10px]" style={{ color: '#A4A9B6' }}>Started {amortStartLabel}</p>}
                    </div>
                </div>
            </div>

            {/* ── Tab Bar ────────────────────────────────────────────────── */}
            <div className="flex gap-0 mb-6" style={{ borderBottom: '2px solid #E2E4E9' }}>
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative"
                            style={{
                                color: isActive ? '#4141A2' : '#A4A9B6',
                                background: 'transparent',
                                borderBottom: isActive ? '2px solid #4141A2' : '2px solid transparent',
                                marginBottom: '-2px',
                            }}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {tab.id === 'tickets' && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: isActive ? '#F0EAF8' : '#F6F6F9', color: isActive ? '#4141A2' : '#A4A9B6' }}>
                                    {project.tickets.length}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content ────────────────────────────────────────────── */}
            {activeTab === 'overview' && <OverviewTab project={project} setProject={setProject} />}
            {activeTab === 'developers' && <DevelopersTab project={project} />}
            {activeTab === 'tickets' && <TicketsTab project={project} />}
            {activeTab === 'amortization' && <AmortizationTab projectId={project.id} project={project} amortData={amortData} loadAmort={loadAmort} />}
            {activeTab === 'audit' && <AuditTrailTab projectId={project.id} projectName={project.name} />}
        </div>
    );
}

// ─── Overview Tab ───────────────────────────────────────────────────────────

function OverviewTab({ project, setProject }: { project: ProjectDetail; setProject: React.Dispatch<React.SetStateAction<ProjectDetail | null>> }) {
    const [editOpen, setEditOpen] = useState(false);
    const [editName, setEditName] = useState(project.name);
    const [editDescription, setEditDescription] = useState(project.description || '');
    const [editStartDate, setEditStartDate] = useState(project.startDate ? project.startDate.split('T')[0] : '');
    const [editLaunchDate, setEditLaunchDate] = useState(project.launchDate ? project.launchDate.split('T')[0] : '');
    const [editAmortMonths, setEditAmortMonths] = useState(String(project.amortizationMonths));
    const [editSaving, setEditSaving] = useState(false);
    const [editSuccess, setEditSuccess] = useState(false);

    const [mgmtAuthorized, setMgmtAuthorized] = useState(project.mgmtAuthorized);
    const [probableToComplete, setProbableToComplete] = useState(project.probableToComplete);
    const [asuSaving, setAsuSaving] = useState(false);
    const [showAsuHelp, setShowAsuHelp] = useState(false);

    const [overrideStatus, setOverrideStatus] = useState(project.status);
    const [overrideReason, setOverrideReason] = useState(project.overrideReason || '');
    const [showOverrideHelp, setShowOverrideHelp] = useState(false);

    const storyPts = project.tickets.filter(t => t.issueType === 'STORY').reduce((s, t) => s + t.storyPoints, 0);
    const bugPts = project.tickets.filter(t => t.issueType === 'BUG').reduce((s, t) => s + t.storyPoints, 0);
    const taskPts = project.tickets.filter(t => t.issueType === 'TASK').reduce((s, t) => s + t.storyPoints, 0);
    const pieData = [
        { name: 'Stories', value: storyPts },
        { name: 'Bugs', value: bugPts },
        { name: 'Tasks', value: taskPts },
    ].filter(d => d.value > 0);

    const totalCost = project.accumulatedCost + project.startingBalance;
    const capAmount = project.isCapitalizable ? totalCost : 0;
    const expAmount = !project.isCapitalizable ? totalCost : 0;
    const barTotal = capAmount + expAmount || 1;

    const saveProjectDetails = async () => {
        setEditSaving(true);
        await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: project.id, name: editName, description: editDescription,
                startDate: editStartDate || null, launchDate: editLaunchDate || null,
                amortizationMonths: parseInt(editAmortMonths) || project.amortizationMonths,
            }),
        });
        setProject(prev => prev ? {
            ...prev, name: editName, description: editDescription,
            startDate: editStartDate || prev.startDate, launchDate: editLaunchDate || null,
            amortizationMonths: parseInt(editAmortMonths) || prev.amortizationMonths,
        } : prev);
        setEditSaving(false);
        setEditSuccess(true);
        setTimeout(() => { setEditSuccess(false); setEditOpen(false); }, 1500);
    };

    const saveAsuFlags = async () => {
        setAsuSaving(true);
        await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: project.id, mgmtAuthorized, probableToComplete }),
        });
        setProject(prev => prev ? { ...prev, mgmtAuthorized, probableToComplete } : prev);
        setAsuSaving(false);
    };

    const saveOverride = async () => {
        await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: project.id, status: overrideStatus, overrideReason }),
        });
        setProject(prev => prev ? { ...prev, status: overrideStatus, overrideReason } : prev);
    };

    return (
        <div className="space-y-6">
            {/* 3-Column Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Project Details */}
                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Project Details</h3>
                    <div className="space-y-3">
                        {[
                            { icon: Tag, label: 'Epic Key', value: project.epicKey, mono: true },
                            { icon: Calendar, label: 'Start Date', value: formatDate(project.startDate) },
                            { icon: Calendar, label: 'Go-Live Date', value: project.launchDate ? formatDate(project.launchDate) : '—' },
                            { icon: FileText, label: 'Useful Life', value: `${project.amortizationMonths} months` },
                        ].map(({ icon: Icon, label, value, mono }) => (
                            <div key={label} className="flex items-center gap-3">
                                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: '#A4A9B6' }} />
                                <span className="text-xs" style={{ color: '#717684' }}>{label}:</span>
                                <span className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`} style={{ color: '#3F4450' }}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Cost Allocation Bar */}
                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Cost Allocation</h3>
                    <div className="rounded-lg overflow-hidden flex" style={{ height: 40, marginBottom: 12 }}>
                        {capAmount > 0 && (
                            <div
                                className="flex items-center justify-center text-xs font-bold text-white"
                                style={{ width: `${(capAmount / barTotal) * 100}%`, background: '#4141A2', minWidth: 60 }}
                            >
                                {formatCurrency(capAmount)}
                            </div>
                        )}
                        {expAmount > 0 && (
                            <div
                                className="flex items-center justify-center text-xs font-bold text-white"
                                style={{ width: `${(expAmount / barTotal) * 100}%`, background: '#FA4338', minWidth: 60 }}
                            >
                                {formatCurrency(expAmount)}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-4 text-xs" style={{ color: '#717684' }}>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#4141A2' }} />
                            Capitalized
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#FA4338' }} />
                            Expensed
                        </div>
                    </div>
                    <p className="text-[10px] mt-3" style={{ color: '#A4A9B6' }}>
                        Status: {project.status} · Capitalizable: {project.isCapitalizable ? 'Yes' : 'No'}
                    </p>
                </div>

                {/* Ticket Distribution Pie */}
                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Ticket Distribution</h3>
                    {pieData.length > 0 ? (
                        <>
                            <ResponsiveContainer width="100%" height={140}>
                                <PieChart>
                                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                                        {pieData.map((_, i) => (
                                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#3F4450' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-1.5 mt-2">
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
                        </>
                    ) : (
                        <p className="text-xs text-center py-8" style={{ color: '#A4A9B6' }}>No ticket data</p>
                    )}
                </div>
            </div>

            {/* ASU 2025-06 Compliance */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#3F4450' }}>
                        <ShieldCheck className="w-4 h-4" style={{ color: '#4141A2' }} /> ASU 2025-06 Readiness
                    </h3>
                    <button onClick={() => setShowAsuHelp(true)} className="text-gray-400 hover:text-gray-600 transition-colors bg-gray-100 rounded-full p-1">
                        <HelpCircle className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-xs mb-5" style={{ color: '#A4A9B6' }}>Required criteria for capitalization under FASB standard (effective Dec 15, 2025)</p>

                {showAsuHelp && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full relative">
                            <button onClick={() => setShowAsuHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            <h3 className="text-lg font-bold mb-4" style={{ color: '#3F4450' }}>ASU 2025-06 Readiness</h3>
                            <div className="space-y-3 text-sm" style={{ color: '#717684' }}>
                                <p><strong style={{ color: '#3F4450' }}>Management Authorized:</strong> Project development has been formally approved by management.</p>
                                <p><strong style={{ color: '#3F4450' }}>Probable to Complete:</strong> It is probable the project will be completed and used as intended.</p>
                                <p>Both conditions must be met for costs to be eligible for capitalization.</p>
                            </div>
                            <button onClick={() => setShowAsuHelp(false)} className="btn-primary w-full mt-6">Got it</button>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <div className="flex items-center justify-between rounded-xl p-4" style={{ background: mgmtAuthorized ? '#EBF5EF' : '#F6F6F9', border: '1px solid', borderColor: mgmtAuthorized ? 'rgba(33,148,78,0.25)' : '#E2E4E9' }}>
                        <div>
                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>Management Authorized</p>
                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>Project development has been approved</p>
                        </div>
                        <button onClick={() => setMgmtAuthorized(!mgmtAuthorized)} className={`toggle-switch ${mgmtAuthorized ? 'active' : ''}`} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl p-4" style={{ background: probableToComplete ? '#EBF5EF' : '#F6F6F9', border: '1px solid', borderColor: probableToComplete ? 'rgba(33,148,78,0.25)' : '#E2E4E9' }}>
                        <div>
                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>Probable to Complete</p>
                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>Project will be completed and used as intended</p>
                        </div>
                        <button onClick={() => setProbableToComplete(!probableToComplete)} className={`toggle-switch ${probableToComplete ? 'active' : ''}`} />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={saveAsuFlags} disabled={asuSaving} className="btn-primary">
                        {asuSaving ? 'Saving...' : 'Save ASU Flags'}
                    </button>
                    <span className="text-xs" style={{ color: (mgmtAuthorized && probableToComplete) ? '#21944E' : '#FA4338' }}>
                        {(mgmtAuthorized && probableToComplete) ? '✓ Eligible to capitalize under ASU 2025-06' : '⚠ Does not meet ASU 2025-06 criteria'}
                    </span>
                </div>
            </div>

            {/* Edit Project Details (collapsed) */}
            <div className="glass-card" style={{ overflow: 'hidden' }}>
                <button onClick={() => setEditOpen(!editOpen)} className="w-full flex items-center justify-between px-6 py-4" style={{ cursor: 'pointer', background: 'transparent', borderBottom: editOpen ? '1px solid #E2E4E9' : 'none' }}>
                    <div className="flex items-center gap-2">
                        <Pencil className="w-4 h-4" style={{ color: '#4141A2' }} />
                        <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>Edit Project Details</span>
                    </div>
                    <span className="text-xs" style={{ color: '#A4A9B6' }}>{editOpen ? '▲ Collapse' : '▼ Expand'}</span>
                </button>
                {editOpen && (
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div><label className="form-label">Project Name</label><input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="form-input" /></div>
                            <div><label className="form-label">Amortization Period (months)</label><input type="number" min={1} max={120} value={editAmortMonths} onChange={e => setEditAmortMonths(e.target.value)} className="form-input" /></div>
                            <div><label className="form-label">Start Date</label><input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} className="form-input" /></div>
                            <div><label className="form-label">Launch Date</label><input type="date" value={editLaunchDate} onChange={e => setEditLaunchDate(e.target.value)} className="form-input" /></div>
                            <div className="md:col-span-2"><label className="form-label">Description</label><textarea rows={3} value={editDescription} onChange={e => setEditDescription(e.target.value)} className="form-input" style={{ resize: 'vertical' }} /></div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <button onClick={saveProjectDetails} disabled={editSaving} className="btn-primary">{editSaving ? 'Saving…' : editSuccess ? '✓ Saved!' : 'Save Changes'}</button>
                            <button onClick={() => setEditOpen(false)} className="btn-secondary"><X className="w-4 h-4" /> Cancel</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Admin Override (collapsed) */}
            <div className="glass-card" style={{ overflow: 'hidden' }}>
                <details>
                    <summary className="px-6 py-4 cursor-pointer flex items-center gap-2 list-none">
                        <AlertCircle className="w-4 h-4" style={{ color: '#FA4338' }} />
                        <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>Admin Override</span>
                        <button onClick={(e) => { e.preventDefault(); setShowOverrideHelp(true); }} className="text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-1 ml-1">
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </summary>
                    <div className="px-6 pb-6" style={{ borderTop: '1px solid #E2E4E9' }}>
                        {showOverrideHelp && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                                <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full relative">
                                    <button onClick={() => setShowOverrideHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                                    <h3 className="text-lg font-bold mb-4" style={{ color: '#3F4450' }}>Admin Override</h3>
                                    <div className="space-y-3 text-sm" style={{ color: '#717684' }}>
                                        <p><strong style={{ color: '#3F4450' }}>Override Status:</strong> Manually force a project&apos;s status, bypassing ticket-based logic.</p>
                                        <p><strong style={{ color: '#3F4450' }}>Justification:</strong> Required audit-trail note explaining the override.</p>
                                    </div>
                                    <button onClick={() => setShowOverrideHelp(false)} className="btn-primary w-full mt-6">Got it</button>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                            <div>
                                <label className="form-label">Override Status</label>
                                <select value={overrideStatus} onChange={e => setOverrideStatus(e.target.value)} className="form-select">
                                    <option value="PLANNING">Planning (Expense)</option>
                                    <option value="DEV">Development (Capitalize)</option>
                                    <option value="LIVE">Live (Amortize)</option>
                                    <option value="RETIRED">Retired</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="form-label">Justification</label>
                                <input type="text" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="e.g. Project failed — force to Expense" className="form-input" />
                            </div>
                        </div>
                        <button onClick={saveOverride} className="btn-primary mt-4">Save Override</button>
                    </div>
                </details>
            </div>
        </div>
    );
}

// ─── Developers Tab ─────────────────────────────────────────────────────────

function DevelopersTab({ project }: { project: ProjectDetail }) {
    const router = useRouter();
    return (
        <div className="glass-card overflow-hidden">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #E2E4E9' }}>
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#3F4450' }}>
                    <User className="w-4 h-4" style={{ color: '#A4A9B6' }} /> Developer Contributions
                </h3>
                <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>{project.developers.length} developers · Click a row to view details</p>
            </div>
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
                    {project.developers.map(dev => (
                        <tr key={dev.id} onClick={() => router.push(`/developers/${dev.id}`)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                            <td className="text-sm font-medium" style={{ color: '#3F4450' }}>{dev.name}</td>
                            <td>
                                <span className="badge" style={{
                                    background: dev.role === 'ENG' ? '#E8F4F8' : dev.role === 'PRODUCT' ? '#F0EAF8' : '#FFF3E0',
                                    color: dev.role === 'ENG' ? '#4141A2' : dev.role === 'PRODUCT' ? '#4141A2' : '#FA4338',
                                }}>{dev.role}</span>
                            </td>
                            <td className="text-right">{dev.ticketCount}</td>
                            <td className="text-right font-semibold" style={{ color: '#21944E' }}>{dev.storyPoints}</td>
                            <td className="text-right font-semibold" style={{ color: '#3F4450' }}>{dev.totalPoints}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Tickets Tab ────────────────────────────────────────────────────────────

function TicketsTab({ project }: { project: ProjectDetail }) {
    const router = useRouter();
    return (
        <div className="glass-card overflow-hidden">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #E2E4E9' }}>
                <h3 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Jira Tickets ({project.tickets.length})</h3>
                <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>Click a row to view ticket details</p>
            </div>
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
                    {project.tickets.map(ticket => (
                        <tr key={ticket.id} onClick={() => router.push(`/tickets/${ticket.id}`)} style={{ cursor: 'pointer' }}>
                            <td><span className="text-xs font-mono" style={{ color: '#4141A2' }}>{ticket.ticketId}</span></td>
                            <td>
                                <span className="badge" style={{
                                    background: ticket.issueType === 'STORY' ? '#EBF5EF' : ticket.issueType === 'BUG' ? '#FFF5F5' : '#F0EAF8',
                                    color: ticket.issueType === 'STORY' ? '#21944E' : ticket.issueType === 'BUG' ? '#FA4338' : '#4141A2',
                                }}>{ticket.issueType}</span>
                            </td>
                            <td className="text-sm max-w-[300px] truncate" style={{ color: '#3F4450' }}>{ticket.summary}</td>
                            <td className="text-sm">{ticket.assignee?.name || '—'}</td>
                            <td className="text-right font-semibold" style={{ color: '#3F4450' }}>{ticket.storyPoints}</td>
                            <td className="text-xs" style={{ color: '#A4A9B6' }}>{formatDate(ticket.resolutionDate)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Amortization Tab ───────────────────────────────────────────────────────

function AmortizationTab({ projectId, project, amortData, loadAmort }: { projectId: string; project: ProjectDetail; amortData: AmortData | null; loadAmort: () => void }) {
    const [editedCharges, setEditedCharges] = useState<Record<string, number>>({});
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    if (!amortData || amortData.rows.length === 0) {
        return (
            <div className="glass-card p-12 text-center">
                <TrendingDown className="w-8 h-8 mx-auto mb-3" style={{ color: '#A4A9B6' }} />
                <p className="text-sm font-medium" style={{ color: '#717684' }}>No amortization schedule</p>
                <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>Set a launch date on the Overview tab to generate the amortization schedule.</p>
            </div>
        );
    }

    const startingAmort = project.startingAmortization ?? 0;
    const displayRows = amortData.rows.map((row) => {
        const key = `${row.year}-${row.month}`;
        const charge = editedCharges[key] !== undefined ? editedCharges[key] : row.charge;
        return { ...row, charge, locallyEdited: editedCharges[key] !== undefined };
    });

    let accumulated = startingAmort;
    for (const row of displayRows) {
        row.opening = Math.max(0, amortData.costBasis - accumulated);
        accumulated += row.charge;
        row.accumulated = Math.round(accumulated * 100) / 100;
        row.nbv = Math.round(Math.max(0, amortData.costBasis - accumulated) * 100) / 100;
    }

    const hasChanges = Object.keys(editedCharges).length > 0;
    const elapsed = displayRows.filter(r => !r.isFuture).length;
    const totalAmortized = displayRows.slice(0, elapsed).reduce((s, r) => s + r.charge, 0);
    const currentNBV = Math.max(0, amortData.costBasis - startingAmort - totalAmortized);

    const handleSave = async () => {
        setSaving(true);
        const overrides = Object.entries(editedCharges).map(([key, charge]) => {
            const [year, month] = key.split('-').map(Number);
            return { month, year, charge };
        });
        await fetch(`/api/projects/${projectId}/amortization`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ overrides }),
        });
        setSaving(false);
        setSaveMessage('Saved!');
        setEditedCharges({});
        setTimeout(() => setSaveMessage(''), 2000);
        loadAmort();
    };

    const handleReset = async () => {
        setSaving(true);
        await fetch(`/api/projects/${projectId}/amortization`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true }),
        });
        setSaving(false);
        setSaveMessage('Reset to straight-line');
        setEditedCharges({});
        setTimeout(() => setSaveMessage(''), 2000);
        loadAmort();
    };

    return (
        <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F0EAF8' }}>
                        <TrendingDown className="w-4 h-4" style={{ color: '#4141A2' }} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Amortization Schedule</h3>
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>
                            {amortData.hasOverrides ? 'Custom schedule' : 'Straight-line'} over {project.amortizationMonths} months
                            {amortData.hasOverrides && <span className="ml-1" style={{ color: '#4141A2' }}>• has overrides</span>}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {saveMessage && <span className="text-xs font-semibold" style={{ color: '#21944E' }}>{saveMessage}</span>}
                    {amortData.hasOverrides && (
                        <button onClick={handleReset} disabled={saving} className="btn-ghost text-xs flex items-center gap-1" title="Reset all overrides to straight-line">
                            <RotateCcw className="w-3 h-3" /> Reset
                        </button>
                    )}
                    {hasChanges && (
                        <button onClick={handleSave} disabled={saving} className="btn-accent text-xs flex items-center gap-1">
                            <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    )}
                </div>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                    { label: 'Cost Basis', value: formatCurrency(amortData.costBasis), color: '#3F4450' },
                    { label: 'Default Monthly', value: formatCurrency(amortData.defaultMonthly), color: '#4141A2' },
                    { label: `Recognized (${elapsed} mo)`, value: formatCurrency(totalAmortized), color: '#FA4338' },
                    { label: 'Net Book Value', value: formatCurrency(currentNBV), color: '#21944E' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl p-3" style={{ background: '#F6F6F9' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#A4A9B6' }}>{label}</p>
                        <p className="text-base font-bold tabular-nums" style={{ color }}>{value}</p>
                    </div>
                ))}
            </div>

            <p className="text-[10px] mb-2" style={{ color: '#A4A9B6' }}>Click any monthly charge to edit it.</p>
            <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
                <table className="data-table" style={{ minWidth: 580 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#F6F6F9' }}>
                        <tr>
                            <th>Period</th>
                            <th className="text-right">Opening Balance</th>
                            <th className="text-right">Monthly Charge</th>
                            <th className="text-right">Accum. Amort.</th>
                            <th className="text-right">Net Book Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map((row, i) => {
                            const key = `${row.year}-${row.month}`;
                            const isEditing = editingCell === key;
                            const isOverridden = row.isOverridden || row.locallyEdited;
                            return (
                                <tr key={i} style={{ opacity: row.isFuture ? 0.55 : 1, background: isOverridden ? '#FFFBF0' : undefined }}>
                                    <td>
                                        <span className="text-xs font-medium" style={{ color: row.isFuture ? '#A4A9B6' : '#3F4450' }}>{row.label}</span>
                                        {row.isFuture && <span className="ml-1 text-[10px]" style={{ color: '#A4A9B6' }}>proj.</span>}
                                        {isOverridden && <span className="ml-1 text-[9px] font-semibold" style={{ color: '#D97706' }}>edited</span>}
                                    </td>
                                    <td className="text-right tabular-nums text-xs" style={{ color: '#717684' }}>{formatCurrency(row.opening)}</td>
                                    <td className="text-right">
                                        {isEditing ? (
                                            <input
                                                type="number" autoFocus defaultValue={row.charge.toFixed(2)}
                                                className="form-input text-xs text-right tabular-nums"
                                                style={{ width: 100, padding: '2px 6px', margin: 0 }} step="0.01"
                                                onBlur={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (!isNaN(val) && val !== amortData.rows[i].charge) {
                                                        setEditedCharges(prev => ({ ...prev, [key]: val }));
                                                    }
                                                    setEditingCell(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                    if (e.key === 'Escape') setEditingCell(null);
                                                }}
                                            />
                                        ) : (
                                            <button
                                                onClick={() => setEditingCell(key)}
                                                className="tabular-nums text-xs font-semibold text-right w-full"
                                                style={{ color: '#4141A2', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                                                title="Click to edit"
                                            >
                                                {formatCurrency(row.charge)}
                                            </button>
                                        )}
                                    </td>
                                    <td className="text-right tabular-nums text-xs" style={{ color: '#FA4338' }}>{formatCurrency(row.accumulated)}</td>
                                    <td className="text-right tabular-nums text-sm font-bold" style={{ color: row.nbv <= 0 ? '#A4A9B6' : '#21944E' }}>{formatCurrency(row.nbv)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Audit Trail Tab ────────────────────────────────────────────────────────

function AuditTrailTab({ projectId, projectName }: { projectId: string; projectName: string }) {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/projects/${projectId}/audit-trail`)
            .then(r => {
                if (!r.ok) throw new Error('Not found');
                return r.json();
            })
            .then(data => setEntries(data.entries || []))
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, [projectId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="glass-card p-12 text-center">
                <ClipboardList className="w-8 h-8 mx-auto mb-3" style={{ color: '#A4A9B6' }} />
                <p className="text-sm font-medium" style={{ color: '#717684' }}>No audit trail entries yet</p>
                <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>Journal entries for this project will appear here after generating entries on the Accounting page.</p>
            </div>
        );
    }

    return (
        <div className="glass-card overflow-hidden">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #E2E4E9' }}>
                <h3 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Audit Trail — {projectName}</h3>
                <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>{entries.length} journal entries across all periods</p>
            </div>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>Type</th>
                        <th>Debit</th>
                        <th>Credit</th>
                        <th className="text-right">Amount</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map(entry => {
                        const typeBg = entry.entryType === 'CAPITALIZATION' ? '#EBF5EF' : entry.entryType === 'EXPENSE' ? '#FFF5F5' : '#EEF2FF';
                        const typeColor = entry.entryType === 'CAPITALIZATION' ? '#21944E' : entry.entryType === 'EXPENSE' ? '#FA4338' : '#4141A2';
                        return (
                            <tr key={entry.id}>
                                <td className="text-xs font-medium" style={{ color: '#3F4450' }}>
                                    {MONTH_NAMES[entry.period.month - 1]} {entry.period.year}
                                </td>
                                <td><span className="badge text-xs" style={{ background: typeBg, color: typeColor }}>{entry.entryType}</span></td>
                                <td className="text-xs" style={{ color: '#717684' }}>{entry.debitAccount}</td>
                                <td className="text-xs" style={{ color: '#717684' }}>{entry.creditAccount}</td>
                                <td className="text-right text-sm font-bold" style={{ color: '#3F4450' }}>{formatCurrency(entry.amount)}</td>
                                <td className="text-xs max-w-[200px] truncate" style={{ color: '#A4A9B6' }}>{entry.description}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
