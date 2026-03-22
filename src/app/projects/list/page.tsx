'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderKanban, ArrowRight, ArrowLeft, ChevronDown, Ticket, Plus, X } from 'lucide-react';
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
                        {projects.map((project) => (
                            <tr key={project.id}>
                                <td>
                                    <div>
                                        <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{project.name}</p>
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
        </div>
    );
}
