'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Users, ArrowRight, FileSpreadsheet, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePeriod } from '@/context/PeriodContext';

interface Developer {
    id: string;
    name: string;
    email: string;
    jiraUserId: string;
    role: string;
    isActive: boolean;
    monthlySalary: number;
    fringeBenefitRate: number;
    stockCompAllocation: number;
    loadedCost: number;
    totalPoints: number;
    capPoints: number;
    expPoints: number;
    capRatio: number;
    ticketCount: number;
}

const ROLES = ['ENG', 'PRODUCT', 'DESIGN', 'QA', 'DATA'];

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
    ENG:     { bg: '#E8F4F8', color: '#4141A2' },
    PRODUCT: { bg: '#F0EAF8', color: '#4141A2' },
    DESIGN:  { bg: '#FFF3E0', color: '#FA4338' },
    QA:      { bg: '#FFFBEB', color: '#D3A236' },
    DATA:    { bg: '#EBF5EF', color: '#21944E' },
};

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

interface AddDevForm {
    name: string;
    email: string;
    jiraUserId: string;
    role: string;
    monthlySalary: string;
    fringeBenefitRate: string;
    stockCompAllocation: string;
}

const EMPTY_FORM: AddDevForm = {
    name: '', email: '', jiraUserId: '', role: 'ENG',
    monthlySalary: '', fringeBenefitRate: '25', stockCompAllocation: '0',
};

export default function DevelopersPage() {
    const [developers, setDevelopers] = useState<Developer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState<AddDevForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { apiParams } = usePeriod();
    const router = useRouter();

    const load = useCallback(() => {
        setLoading(true);
        fetch(`/api/developers?${apiParams}`)
            .then((res) => res.json())
            .then(setDevelopers)
            .finally(() => setLoading(false));
    }, [apiParams]);

    useEffect(() => { load(); }, [load]);

    const openModal = () => { setForm(EMPTY_FORM); setError(null); setShowModal(true); };
    const closeModal = () => { setShowModal(false); setError(null); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/developers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    email: form.email,
                    jiraUserId: form.jiraUserId,
                    role: form.role,
                    monthlySalary: parseFloat(form.monthlySalary) || 0,
                    fringeBenefitRate: (parseFloat(form.fringeBenefitRate) || 25) / 100,
                    stockCompAllocation: parseFloat(form.stockCompAllocation) || 0,
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                setError(d.error || 'Failed to create developer');
                return;
            }
            closeModal();
            load();
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
                <Link href="/developers" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to FTE & Payroll
                </Link>
            </div>
            
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-header">Payroll Roster</h1>
                    <p className="section-subtext">Developer profile and capitalization allocation management</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/developers/payroll-register" className="btn-ghost text-xs">
                        <FileSpreadsheet className="w-4 h-4" /> Payroll Register
                    </Link>
                    <div className="flex items-center gap-2 text-xs" style={{ color: '#A4A9B6' }}>
                        <Users className="w-4 h-4" />
                        <span>{developers.length} developers</span>
                    </div>
                    <button onClick={openModal} className="btn-primary">
                        <Plus className="w-4 h-4" /> Add Developer
                    </button>
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Developer</th>
                            <th>Role</th>
                            <th className="text-right">Loaded Cost</th>
                            <th className="text-right">Cap %</th>
                            <th className="text-right">Exp %</th>
                            <th>Allocation</th>
                            <th className="text-right">Tickets</th>
                        </tr>
                    </thead>
                    <tbody>
                        {developers.map((dev) => {
                            const capPct = (dev.capRatio * 100).toFixed(1);
                            const expPct = ((1 - dev.capRatio) * 100).toFixed(1);
                            const rs = ROLE_STYLE[dev.role] || ROLE_STYLE.ENG;
                            return (
                                <tr 
                                    key={dev.id} 
                                    onClick={() => router.push(`/developers/${dev.id}`)}
                                    style={{ cursor: 'pointer' }} 
                                    className="hover:bg-gray-50/50 transition-colors"
                                >
                                    <td>
                                        <div>
                                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{dev.name}</p>
                                            <p className="text-xs" style={{ color: '#A4A9B6' }}>{dev.email}</p>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="badge" style={{ background: rs.bg, color: rs.color }}>{dev.role}</span>
                                    </td>
                                    <td className="text-right text-sm font-semibold" style={{ color: '#3F4450' }}>{fmt(dev.loadedCost)}</td>
                                    <td className="text-right">
                                        <span className="text-sm font-semibold" style={{ color: '#21944E' }}>{capPct}%</span>
                                    </td>
                                    <td className="text-right">
                                        <span className="text-sm font-semibold" style={{ color: '#FA4338' }}>{expPct}%</span>
                                    </td>
                                    <td>
                                        <div className="w-full h-2 rounded-full overflow-hidden flex" style={{ minWidth: 100, background: '#E2E4E9' }}>
                                            <div className="h-full transition-all" style={{ width: `${capPct}%`, background: '#21944E' }} />
                                            <div className="h-full transition-all" style={{ width: `${expPct}%`, background: '#FA4338' }} />
                                        </div>
                                    </td>
                                    <td className="text-right text-sm">{dev.ticketCount}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Add Developer Modal */}
            {showModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div className="glass-card w-full max-w-lg mx-4 p-6" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-base font-bold" style={{ color: '#3F4450' }}>Add Developer</h2>
                            <button onClick={closeModal} className="btn-ghost" style={{ padding: '4px' }}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Full Name <span style={{ color: '#FA4338' }}>*</span></label>
                                    <input
                                        className="form-input"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="Alice Chen"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Role <span style={{ color: '#FA4338' }}>*</span></label>
                                    <select
                                        className="form-select"
                                        value={form.role}
                                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                                    >
                                        {ROLES.map((r) => <option key={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="form-label">Work Email <span style={{ color: '#FA4338' }}>*</span></label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    placeholder="alice@company.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="form-label">Jira User ID <span className="text-xs" style={{ color: '#A4A9B6' }}>(optional)</span></label>
                                <input
                                    className="form-input"
                                    value={form.jiraUserId}
                                    onChange={(e) => setForm({ ...form, jiraUserId: e.target.value })}
                                    placeholder="e.g. alice.chen or 5c9f3..."
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="form-label">Monthly Salary ($)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="form-input"
                                        value={form.monthlySalary}
                                        onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })}
                                        placeholder="12500"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Fringe Rate (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        className="form-input"
                                        value={form.fringeBenefitRate}
                                        onChange={(e) => setForm({ ...form, fringeBenefitRate: e.target.value })}
                                        placeholder="25"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Stock Comp ($/mo)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="form-input"
                                        value={form.stockCompAllocation}
                                        onChange={(e) => setForm({ ...form, stockCompAllocation: e.target.value })}
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            {/* Loaded cost preview */}
                            {form.monthlySalary && (
                                <div className="rounded-xl p-3" style={{ background: '#F6F6F9' }}>
                                    <p className="text-xs" style={{ color: '#A4A9B6' }}>
                                        Loaded monthly cost:{' '}
                                        <strong style={{ color: '#3F4450' }}>
                                            {fmt(
                                                (parseFloat(form.monthlySalary) || 0) *
                                                (1 + (parseFloat(form.fringeBenefitRate) || 0) / 100) +
                                                (parseFloat(form.stockCompAllocation) || 0)
                                            )}
                                        </strong>
                                    </p>
                                </div>
                            )}

                            {error && (
                                <p className="text-xs" style={{ color: '#FA4338' }}>{error}</p>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button type="button" onClick={closeModal} className="btn-ghost">Cancel</button>
                                <button type="submit" className="btn-primary" disabled={saving}>
                                    {saving ? 'Adding...' : 'Add Developer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
