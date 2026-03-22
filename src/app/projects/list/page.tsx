'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderKanban, ArrowRight, ArrowLeft, ChevronDown, Ticket, Plus, X, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface Project {
    id: string;
    name: string;
    description: string;
    epicKey: string;
    status: string;
    isCapitalizable: boolean;
    totalCost: number;
    accumulatedCost: number;
    ytdCost: number;
    itdCost: number;
    capitalizedAmount: number;
    depreciation: number;
    netAssetValue: number;
    startingBalance: number;
    startDate: string;
    launchDate: string | null;
    overrideReason: string | null;
    ticketCount: number;
    storyPoints: number;
    bugCount: number;
    parentProjectId: string | null;
    legacyChildren: { id: string; name: string; startingBalance: number; startingAmortization: number }[];
}

const BLANK_FORM = {
    name: '',
    description: '',
    epicKey: '',
    status: 'PLANNING',
    isCapitalizable: true,
    amortizationMonths: 36,
    startDate: '',
    launchDate: '',
    startingBalance: '',
    startingAmortization: '',
};

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(BLANK_FORM);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

    // ── Legacy Project Modal State ──
    const [showLegacyModal, setShowLegacyModal] = useState(false);
    const [legacyForm, setLegacyForm] = useState({ name: '', capitalizedAmount: '', asOfDate: '', accumulatedDepreciation: '', usefulLife: 36 });
    const [legacySchedule, setLegacySchedule] = useState<{ month: number; year: number; charge: number }[]>([]);
    const [legacySaving, setLegacySaving] = useState(false);
    const [legacyError, setLegacyError] = useState<string | null>(null);
    const [linkedProjectId, setLinkedProjectId] = useState<string>('');

    // Auto-generate amortization schedule when form values change
    const recalcSchedule = (capAmt: string, accDep: string, asOf: string, life: number) => {
        const cap = parseFloat(capAmt) || 0;
        const dep = parseFloat(accDep) || 0;
        if (!asOf || cap <= 0 || life <= 0) { setLegacySchedule([]); return; }
        const remaining = Math.max(0, cap - dep);
        const monthlyCharge = remaining / life;
        const asOfDate = new Date(asOf + 'T00:00:00');
        const startMonth = asOfDate.getMonth() + 2; // month after as-of (0-indexed + 1 + 1)
        const startYear = asOfDate.getFullYear();
        const rows: { month: number; year: number; charge: number }[] = [];
        for (let i = 0; i < life; i++) {
            const m = ((startMonth - 1 + i) % 12) + 1;
            const y = startYear + Math.floor((startMonth - 1 + i) / 12);
            rows.push({ month: m, year: y, charge: Math.round(monthlyCharge * 100) / 100 });
        }
        setLegacySchedule(rows);
    };

    const updateLegacyField = (field: string, value: string | number) => {
        const updated = { ...legacyForm, [field]: value };
        setLegacyForm(updated);
        recalcSchedule(updated.capitalizedAmount, updated.accumulatedDepreciation, updated.asOfDate, updated.usefulLife);
    };

    const updateScheduleRow = (index: number, charge: number) => {
        setLegacySchedule(prev => prev.map((row, i) => i === index ? { ...row, charge } : row));
    };

    const createLegacyProject = async () => {
        const cap = parseFloat(legacyForm.capitalizedAmount);
        const dep = parseFloat(legacyForm.accumulatedDepreciation) || 0;
        if (!legacyForm.name) { setLegacyError('Project name is required.'); return; }
        if (!cap || cap <= 0) { setLegacyError('Capitalized amount is required.'); return; }
        if (!legacyForm.asOfDate) { setLegacyError('As-of date is required.'); return; }
        if (legacySchedule.length === 0) { setLegacyError('Amortization schedule is empty.'); return; }

        setLegacySaving(true);
        setLegacyError(null);
        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: legacyForm.name,
                    status: 'LIVE',
                    isCapitalizable: true,
                    amortizationMonths: legacyForm.usefulLife,
                    startDate: legacyForm.asOfDate,
                    launchDate: legacyForm.asOfDate,
                    startingBalance: cap,
                    startingAmortization: dep,
                    amortizationSchedule: legacySchedule,
                    ...(linkedProjectId && { parentProjectId: linkedProjectId }),
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                setLegacyError(err.error || 'Failed to create project');
                return;
            }
            setShowLegacyModal(false);
            setLegacyForm({ name: '', capitalizedAmount: '', asOfDate: '', accumulatedDepreciation: '', usefulLife: 36 });
            setLegacySchedule([]);
            setLinkedProjectId('');
            loadProjects();
        } catch {
            setLegacyError('Network error — please try again.');
        } finally {
            setLegacySaving(false);
        }
    };

    const loadProjects = () => {
        setLoading(true);
        fetch('/api/projects')
            .then((res) => res.json())
            .then(setProjects)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadProjects(); }, []);

    const toggleCapitalizable = async (project: Project) => {
        const updated = !project.isCapitalizable;
        await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: project.id, isCapitalizable: updated }),
        });
        setProjects((prev) =>
            prev.map((p) => (p.id === project.id ? { ...p, isCapitalizable: updated } : p))
        );
    };

    const updateStatus = async (project: Project, status: string) => {
        setOpenDropdownId(null);
        await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: project.id, status }),
        });
        setProjects((prev) =>
            prev.map((p) => (p.id === project.id ? { ...p, status } : p))
        );
    };

    const createProject = async () => {
        if (!form.name || !form.epicKey) {
            setSaveError('Name and Epic Key are required.');
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    amortizationMonths: Number(form.amortizationMonths),
                    startDate: form.startDate || undefined,
                    launchDate: form.launchDate || undefined,
                    startingBalance: form.startingBalance ? Number(form.startingBalance) : 0,
                    startingAmortization: form.startingAmortization ? Number(form.startingAmortization) : 0,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                setSaveError(err.error || 'Failed to create project');
                return;
            }
            setShowModal(false);
            setForm(BLANK_FORM);
            loadProjects();
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-4">
                <Link href="/projects" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Projects
                </Link>
            </div>

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-header">Projects Table</h1>
                    <p className="section-subtext">Manage software assets and capitalization status</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/projects/details"
                        className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors px-4 py-2 text-sm"
                        style={{ background: '#FFFFFF', border: '1px solid #E2E4E9', color: '#3F4450', boxShadow: '0 1px 2px rgba(63,68,80,0.05)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.borderColor = '#A4A9B6'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E4E9'; }}
                    >
                        <Ticket className="w-4 h-4 text-[#A4A9B6]" /> Project Details & Import
                    </Link>
                    <Button onClick={() => { setForm(BLANK_FORM); setSaveError(null); setShowModal(true); }}>
                        <Plus className="w-4 h-4" /> New Project
                    </Button>
                    <Button variant="secondary" onClick={() => { setLegacyError(null); setShowLegacyModal(true); }}>
                        <Calendar className="w-4 h-4" /> Legacy Project
                    </Button>
                </div>
            </div>



            <Card>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Status</th>
                            <th>Treatment</th>
                            <th className="text-right">Capitalized</th>
                            <th className="text-right">Depreciation</th>
                            <th className="text-right">Net Asset Value</th>
                            <th className="text-right">Tickets</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.filter(p => !p.parentProjectId).map((project) => (
                            <tr key={project.id}>
                                <td>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{project.name}</p>
                                            {project.legacyChildren?.length > 0 && (
                                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ background: '#EDE9F7', color: '#4141A2' }}>
                                                    {project.legacyChildren.length} Legacy
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>{project.description}</p>
                                    </div>
                                </td>
                                <td>
                                    <div className="relative">
                                        <button className="cursor-pointer" onClick={() => setOpenDropdownId(openDropdownId === project.id ? null : project.id)}>
                                            <StatusBadge status={project.status} className="flex items-center gap-1">
                                                <ChevronDown className="w-3 h-3" />
                                            </StatusBadge>
                                        </button>
                                        {openDropdownId === project.id && (
                                            <>
                                                <div className="fixed inset-0 z-[5]" onClick={() => setOpenDropdownId(null)} />
                                                <div className="absolute top-full left-0 mt-1 border rounded-lg p-1 z-10 min-w-[120px] shadow-lg" style={{ background: '#FFFFFF', borderColor: '#E2E4E9' }}>
                                                    {['PLANNING', 'DEV', 'LIVE', 'RETIRED'].map((s) => (
                                                        <button
                                                            key={s}
                                                            onClick={() => updateStatus(project, s)}
                                                            className="block w-full text-left px-3 py-1.5 text-xs rounded"
                                                            style={{ color: '#3F4450' }}
                                                            onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F6F9')}
                                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <button
                                        onClick={() => toggleCapitalizable(project)}
                                        className={`toggle-switch ${project.isCapitalizable ? 'active' : ''}`}
                                        title={project.isCapitalizable ? 'Capitalize' : 'Expense'}
                                    />
                                    <span className="text-[10px] ml-2 uppercase font-semibold" style={{ color: '#A4A9B6' }}>
                                        {project.isCapitalizable ? 'Cap' : 'Exp'}
                                    </span>
                                </td>
                                <td className="text-right">
                                    <span className="text-sm font-semibold" style={{ color: project.capitalizedAmount > 0 ? '#4141A2' : '#3F4450' }}>{formatCurrency(project.capitalizedAmount)}</span>
                                </td>
                                <td className="text-right">
                                    <span className="text-sm font-semibold" style={{ color: project.depreciation > 0 ? '#FA4338' : '#A4A9B6' }}>{formatCurrency(project.depreciation)}</span>
                                </td>
                                <td className="text-right">
                                    <span className="text-sm font-bold" style={{ color: project.netAssetValue > 0 ? '#21944E' : '#A4A9B6' }}>{formatCurrency(project.netAssetValue)}</span>
                                </td>
                                <td className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Badge className="text-[10px]" style={{ background: '#EBF5EF', color: '#21944E' }}>{Number.isInteger(project.storyPoints) ? project.storyPoints.toFixed(1) : project.storyPoints.toFixed(1)} SP</Badge>
                                        <Badge className="text-[10px]" style={{ background: '#FFF5F5', color: '#FA4338' }}>{project.bugCount} bugs</Badge>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <Link href={`/projects/${project.id}/tickets`} className="btn-ghost text-xs">
                                            <Ticket className="w-3 h-3" /> Tickets
                                        </Link>
                                        <Link href={`/projects/${project.id}`} className="btn-ghost text-xs">
                                            Details <ArrowRight className="w-3 h-3" />
                                        </Link>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            {/* ─── New Project Modal ─── */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#EBF5EF' }}>
                                    <FolderKanban className="w-4.5 h-4.5" style={{ color: '#21944E' }} />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold" style={{ color: '#3F4450' }}>New Project</h2>
                                    <p className="text-xs" style={{ color: '#A4A9B6' }}>Create a new capitalizable software asset</p>
                                </div>
                            </div>
                            <button onClick={() => setShowModal(false)} style={{ color: '#A4A9B6' }} className="hover:opacity-70">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Project Name <span style={{ color: '#FA4338' }}>*</span></label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="e.g. Payments v2"
                                        className="form-input"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Epic Key <span style={{ color: '#FA4338' }}>*</span></label>
                                    <input
                                        type="text"
                                        value={form.epicKey}
                                        onChange={(e) => setForm({ ...form, epicKey: e.target.value.toUpperCase() })}
                                        placeholder="e.g. PAY-001"
                                        className="form-input font-mono"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="form-label">Description</label>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="Short description of the project"
                                    className="form-input"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Status</label>
                                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="form-select">
                                        <option value="PLANNING">Planning (Expense)</option>
                                        <option value="DEV">Development (Capitalize)</option>
                                        <option value="LIVE">Live (Amortize)</option>
                                        <option value="RETIRED">Retired</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Useful Life (Months)</label>
                                    <input
                                        type="number"
                                        value={form.amortizationMonths}
                                        onChange={(e) => setForm({ ...form, amortizationMonths: Number(e.target.value) })}
                                        min={1}
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Start Date</label>
                                    <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="form-input" />
                                </div>
                                <div>
                                    <label className="form-label">Launch Date</label>
                                    <input type="date" value={form.launchDate} onChange={(e) => setForm({ ...form, launchDate: e.target.value })} className="form-input" />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-1">
                                <button
                                    onClick={() => setForm({ ...form, isCapitalizable: !form.isCapitalizable })}
                                    className={`toggle-switch ${form.isCapitalizable ? 'active' : ''}`}
                                />
                                <span className="text-sm font-medium" style={{ color: '#3F4450' }}>
                                    {form.isCapitalizable ? 'Capitalizable (DEV costs will be capitalized)' : 'Expensed (all costs will be expensed)'}
                                </span>
                            </div>

                            {/* Legacy Asset Section */}
                            <div className="rounded-xl border p-4" style={{ borderColor: '#E2E4E9', background: '#FAFBFC' }}>
                                <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: '#A4A9B6' }}>Legacy Asset (Optional)</p>
                                <p className="text-xs mb-3" style={{ color: '#717684' }}>For projects from prior periods with existing cost basis that need to continue amortizing.</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="form-label">Starting Balance ($)</label>
                                        <input
                                            type="number"
                                            value={form.startingBalance}
                                            onChange={(e) => setForm({ ...form, startingBalance: e.target.value })}
                                            placeholder="0.00"
                                            className="form-input"
                                            min={0}
                                            step="0.01"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">Accumulated Amortization ($)</label>
                                        <input
                                            type="number"
                                            value={form.startingAmortization}
                                            onChange={(e) => setForm({ ...form, startingAmortization: e.target.value })}
                                            placeholder="0.00"
                                            className="form-input"
                                            min={0}
                                            step="0.01"
                                        />
                                    </div>
                                </div>
                            </div>

                            {saveError && (
                                <p className="text-sm" style={{ color: '#FA4338' }}>{saveError}</p>
                            )}

                            <div className="flex gap-3 pt-2">
                                <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
                                <Button variant="primary" onClick={createProject} isLoading={saving} className="flex-1">
                                    {saving ? 'Creating...' : 'Create Project'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ─── Legacy Project Modal ─── */}
            {showLegacyModal && (
                <div className="modal-overlay" onClick={() => setShowLegacyModal(false)}>
                    <div className="modal-content" style={{ maxWidth: 680, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#EDE9F7' }}>
                                    <Calendar className="w-4.5 h-4.5" style={{ color: '#4141A2' }} />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold" style={{ color: '#3F4450' }}>Legacy Project</h2>
                                    <p className="text-xs" style={{ color: '#A4A9B6' }}>Import a project with existing cost basis &amp; amortization</p>
                                </div>
                            </div>
                            <button onClick={() => setShowLegacyModal(false)} style={{ color: '#A4A9B6' }} className="hover:opacity-70">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Project Name */}
                            <div>
                                <label className="form-label">Project Name <span style={{ color: '#FA4338' }}>*</span></label>
                                <input
                                    type="text"
                                    value={legacyForm.name}
                                    onChange={(e) => updateLegacyField('name', e.target.value)}
                                    placeholder="e.g. Platform Migration v1"
                                    className="form-input"
                                />
                            </div>

                            {/* Link to Existing Project */}
                            <div className="rounded-xl border p-4" style={{ borderColor: '#E2E4E9', background: '#FAFBFC' }}>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Link to Existing Project</p>
                                    {linkedProjectId && (
                                        <button
                                            onClick={() => setLinkedProjectId('')}
                                            className="text-[10px] font-semibold hover:underline"
                                            style={{ color: '#FA4338' }}
                                        >
                                            Remove Link
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs mb-3" style={{ color: '#717684' }}>
                                    {linkedProjectId
                                        ? 'This legacy asset will appear as a ticket under the linked project.'
                                        : 'Optional — link to an existing project, or leave empty for a standalone legacy asset.'}
                                </p>
                                <select
                                    value={linkedProjectId}
                                    onChange={(e) => setLinkedProjectId(e.target.value)}
                                    className="form-select text-sm w-full"
                                >
                                    <option value="">— Standalone (no link) —</option>
                                    {projects
                                        .filter(p => !p.parentProjectId && p.status !== 'RETIRED')
                                        .map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))
                                    }
                                </select>
                            </div>

                            {/* Amount + As-of Date row */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Capitalized Amount ($) <span style={{ color: '#FA4338' }}>*</span></label>
                                    <input
                                        type="number"
                                        value={legacyForm.capitalizedAmount}
                                        onChange={(e) => updateLegacyField('capitalizedAmount', e.target.value)}
                                        placeholder="250,000"
                                        className="form-input"
                                        min={0}
                                        step="0.01"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">As-of Date <span style={{ color: '#FA4338' }}>*</span></label>
                                    <input
                                        type="date"
                                        value={legacyForm.asOfDate}
                                        onChange={(e) => updateLegacyField('asOfDate', e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            {/* Depreciation + Useful Life row */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Accumulated Depreciation ($)</label>
                                    <input
                                        type="number"
                                        value={legacyForm.accumulatedDepreciation}
                                        onChange={(e) => updateLegacyField('accumulatedDepreciation', e.target.value)}
                                        placeholder="0.00"
                                        className="form-input"
                                        min={0}
                                        step="0.01"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Useful Life (Months)</label>
                                    <input
                                        type="number"
                                        value={legacyForm.usefulLife}
                                        onChange={(e) => updateLegacyField('usefulLife', Number(e.target.value) || 36)}
                                        min={1}
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            {/* Amortization Schedule Preview */}
                            {legacySchedule.length > 0 && (
                                <div className="rounded-xl border" style={{ borderColor: '#E2E4E9' }}>
                                    <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#E2E4E9', background: '#FAFBFC' }}>
                                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#717684' }}>Amortization Schedule</p>
                                        <p className="text-[11px] font-semibold" style={{ color: '#4141A2' }}>
                                            Total: {formatCurrency(legacySchedule.reduce((sum, r) => sum + r.charge, 0))}
                                        </p>
                                    </div>
                                    <div style={{ maxHeight: 280, overflow: 'auto' }}>
                                        <table className="data-table" style={{ margin: 0 }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ position: 'sticky', top: 0, background: '#FAFBFC', zIndex: 1 }}>Month</th>
                                                    <th style={{ position: 'sticky', top: 0, background: '#FAFBFC', zIndex: 1 }} className="text-right">Monthly Charge ($)</th>
                                                    <th style={{ position: 'sticky', top: 0, background: '#FAFBFC', zIndex: 1 }} className="text-right">Remaining NBV</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const cap = parseFloat(legacyForm.capitalizedAmount) || 0;
                                                    const dep = parseFloat(legacyForm.accumulatedDepreciation) || 0;
                                                    let runningNbv = cap - dep;
                                                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                                    return legacySchedule.map((row, i) => {
                                                        runningNbv = Math.max(0, runningNbv - row.charge);
                                                        return (
                                                            <tr key={i}>
                                                                <td className="text-xs font-medium" style={{ color: '#3F4450' }}>
                                                                    {monthNames[row.month - 1]} {row.year}
                                                                </td>
                                                                <td className="text-right">
                                                                    <input
                                                                        type="number"
                                                                        value={row.charge}
                                                                        onChange={(e) => updateScheduleRow(i, parseFloat(e.target.value) || 0)}
                                                                        className="text-right text-xs font-mono w-28 rounded-md px-2 py-1 border transition-colors focus:outline-none"
                                                                        style={{ borderColor: '#E2E4E9', color: '#3F4450', background: '#fff' }}
                                                                        onFocus={(e) => { e.currentTarget.style.borderColor = '#4141A2'; }}
                                                                        onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E4E9'; }}
                                                                        min={0}
                                                                        step="0.01"
                                                                    />
                                                                </td>
                                                                <td className="text-right text-xs font-mono" style={{ color: runningNbv <= 0 ? '#A4A9B6' : '#3F4450' }}>
                                                                    {formatCurrency(runningNbv)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {legacyError && (
                                <p className="text-sm" style={{ color: '#FA4338' }}>{legacyError}</p>
                            )}

                            <div className="flex gap-3 pt-2">
                                <Button variant="secondary" onClick={() => setShowLegacyModal(false)} className="flex-1">Cancel</Button>
                                <Button variant="primary" onClick={createLegacyProject} isLoading={legacySaving} className="flex-1">
                                    {legacySaving ? 'Creating...' : 'Create Legacy Project'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
