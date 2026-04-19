'use client';

import { useEffect, useState, useCallback } from 'react';
import { FlaskConical, DollarSign, Users, FolderKanban, Plus, Trash2, Edit2, Check, X, Info } from 'lucide-react';

const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

interface Developer { devId: string; devName: string; role: string; totalNetCost: number; qreWages: number; qrePct: number; }
interface Project { projectId: string; projectName: string; isQRE: boolean; qreWages: number; }
interface Contractor { id: string; vendor: string; description?: string; amount: number; qrePct: number; period: string; year: number; }
interface Form6765Data {
    year: number;
    totalQREWages: number;
    totalContractQRE: number;
    totalQRE: number;
    estimatedCredit: number;
    developers: Developer[];
    projects: Project[];
    contractors: Contractor[];
}

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const PERIODS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function SummaryCard({ icon: Icon, label, value, sub, color = '#4141A2' }: { icon: any; label: string; value: string; sub?: string; color?: string }) {
    return (
        <div className="glass-card p-5" style={{ borderTop: `3px solid ${color}` }}>
            <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>{label}</p>
                <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <p className="text-2xl font-black" style={{ color: '#3F4450' }}>{value}</p>
            {sub && <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>{sub}</p>}
        </div>
    );
}

export default function RDCreditPage() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [priorQRE, setPriorQRE] = useState('');
    const [data, setData] = useState<Form6765Data | null>(null);
    const [loading, setLoading] = useState(true);

    // Contractor form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ vendor: '', description: '', amount: '', qrePct: '65', period: 'January', year: String(new Date().getFullYear()) });
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`/api/rd-credit/form6765?year=${year}`)
            .then(r => r.ok ? r.json() : null)
            .then(setData)
            .finally(() => setLoading(false));
    }, [year]);

    useEffect(() => { load(); }, [load]);

    // ASC credit calculation
    // ASC = 14% × max(0, currentQRE − 50% × avgPrior3YearQRE)
    const prior3Avg = priorQRE ? parseFloat(priorQRE.replace(/[$,]/g, '')) : 0;
    const ascBase = prior3Avg * 0.5;
    const ascExcess = data ? Math.max(0, data.totalQRE - ascBase) : 0;
    const ascCredit = ascExcess * 0.14;

    const handleSaveContractor = async () => {
        setSaving(true);
        try {
            const payload = {
                vendor: form.vendor,
                description: form.description || undefined,
                amount: parseFloat(form.amount.replace(/[$,]/g, '')),
                qrePct: parseFloat(form.qrePct) / 100,
                period: `${form.period} ${form.year}`,
                year: parseInt(form.year),
            };
            const url = editingId ? `/api/rd-credit/contractors/${editingId}` : '/api/rd-credit/contractors';
            const method = editingId ? 'PATCH' : 'POST';
            await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            setShowAddForm(false);
            setEditingId(null);
            setForm({ vendor: '', description: '', amount: '', qrePct: '65', period: 'January', year: String(year) });
            load();
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteContractor = async (id: string) => {
        if (!confirm('Delete this contractor entry?')) return;
        await fetch(`/api/rd-credit/contractors/${id}`, { method: 'DELETE' });
        load();
    };

    const startEdit = (c: Contractor) => {
        const [mon] = c.period.split(' ');
        setForm({ vendor: c.vendor, description: c.description || '', amount: String(c.amount), qrePct: String(Math.round(c.qrePct * 100)), period: mon || 'January', year: String(c.year) });
        setEditingId(c.id);
        setShowAddForm(true);
    };

    const inputStyle = { width: '100%', padding: '8px 10px', border: '1.5px solid #E2E4E9', borderRadius: 8, fontSize: 12, color: '#3F4450', background: '#FFF', outline: 'none' };
    const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#717684', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <FlaskConical className="w-5 h-5" style={{ color: '#4141A2' }} />
                        <h1 className="section-header" style={{ margin: 0 }}>R&amp;D Tax Credit</h1>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#F0EAF8', color: '#4141A2' }}>IRC §41 / Form 6765</span>
                    </div>
                    <p className="section-subtext">Qualified Research Expense (QRE) computation — Alternative Simplified Credit method</p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold" style={{ color: '#717684' }}>Tax Year</label>
                    <select
                        value={year}
                        onChange={e => setYear(parseInt(e.target.value))}
                        style={{ padding: '6px 10px', border: '1.5px solid #E2E4E9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#3F4450', background: '#FFF', cursor: 'pointer' }}
                    >
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#4141A2', borderTopColor: 'transparent' }} />
                </div>
            ) : data ? (
                <div className="flex flex-col gap-8">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        <SummaryCard icon={Users} label="QRE Wages" value={fmt(data.totalQREWages)} sub="Developer labor qualifying as QRE" color="#4141A2" />
                        <SummaryCard icon={FolderKanban} label="Contract Research QRE" value={fmt(data.totalContractQRE)} sub="65% of qualifying contractor spend" color="#D3A236" />
                        <SummaryCard icon={DollarSign} label="Total QRE" value={fmt(data.totalQRE)} sub="Wages + contract research" color="#21944E" />
                        <SummaryCard icon={FlaskConical} label="Est. R&D Credit (ASC)" value={fmt(ascCredit)} sub={ascCredit === data.estimatedCredit ? '14% of total QRE (no prior-year base set)' : `14% × excess after ${pct(0.5)} of prior avg`} color="#FA4338" />
                    </div>

                    {/* ASC Calculation Panel */}
                    <div className="glass-card p-6">
                        <h2 className="text-sm font-bold mb-1" style={{ color: '#3F4450' }}>ASC Credit Calculation (14% Rate)</h2>
                        <p className="text-xs mb-4" style={{ color: '#A4A9B6' }}>
                            Formula: <code style={{ background: '#F0EAF8', padding: '1px 6px', borderRadius: 4, color: '#4141A2' }}>14% × max(0, Current QRE − 50% × Avg Prior 3-Year QRE)</code>
                        </p>
                        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                            <div>
                                <p style={labelStyle}>Current Year QRE ({year})</p>
                                <p className="text-lg font-black" style={{ color: '#4141A2' }}>{fmt(data.totalQRE)}</p>
                            </div>
                            <div>
                                <label style={labelStyle} htmlFor="prior-qre">Avg Prior 3-Year QRE <span style={{ color: '#FA4338' }}>*</span></label>
                                <input
                                    id="prior-qre"
                                    type="text"
                                    placeholder="e.g. 500000"
                                    value={priorQRE}
                                    onChange={e => setPriorQRE(e.target.value)}
                                    style={inputStyle}
                                />
                                <p className="text-[10px] mt-1" style={{ color: '#A4A9B6' }}>Enter manually — prior years may not be in system yet</p>
                            </div>
                            <div>
                                <p style={labelStyle}>Estimated Credit</p>
                                <p className="text-lg font-black" style={{ color: '#21944E' }}>{fmt(ascCredit)}</p>
                                {prior3Avg > 0 && (
                                    <p className="text-[10px] mt-1" style={{ color: '#A4A9B6' }}>
                                        14% × max(0, {fmt(data.totalQRE)} − {fmt(ascBase)}) = 14% × {fmt(ascExcess)}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-start gap-2 mt-4 p-3 rounded-lg" style={{ background: '#FFF5F5', border: '1px solid #FECDCA' }}>
                            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#FA4338' }} />
                            <p className="text-[11px]" style={{ color: '#717684' }}>
                                This is an estimate for planning purposes only. Consult your tax advisor to confirm QRE qualification, apply state credits, and file Form 6765.
                            </p>
                        </div>
                    </div>

                    {/* Developer Breakdown */}
                    <div className="glass-card overflow-hidden">
                        <div className="px-5 py-4 border-b" style={{ borderColor: '#E2E4E9' }}>
                            <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>Developer QRE Breakdown</h2>
                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>QRE wages = net allocated cost × (QRE story points / total story points)</p>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr style={{ background: '#FAFBFC', borderBottom: '2px solid #E2E4E9' }}>
                                        {['Developer', 'Role', 'Net Cost', 'QRE Wages', 'QRE %'].map(h => (
                                            <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.developers.map((d, i) => (
                                        <tr key={d.devId} style={{ borderBottom: '1px solid #F0F0F4', background: i % 2 === 0 ? '#FFF' : '#FAFBFC' }}>
                                            <td className="px-4 py-2.5 font-semibold" style={{ color: '#3F4450' }}>{d.devName.split(',').reverse().join(' ').trim()}</td>
                                            <td className="px-4 py-2.5">
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#F0EAF8', color: '#4141A2' }}>{d.role}</span>
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums" style={{ color: '#717684' }}>{fmt(d.totalNetCost)}</td>
                                            <td className="px-4 py-2.5 tabular-nums font-bold" style={{ color: '#4141A2' }}>{fmt(d.qreWages)}</td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div style={{ flex: 1, height: 4, background: '#E2E4E9', borderRadius: 2, overflow: 'hidden', maxWidth: 80 }}>
                                                        <div style={{ width: `${Math.min(d.qrePct * 100, 100)}%`, height: '100%', background: '#4141A2', borderRadius: 2 }} />
                                                    </div>
                                                    <span className="tabular-nums font-semibold" style={{ color: '#3F4450' }}>{pct(d.qrePct)}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {data.developers.length === 0 && (
                                        <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#A4A9B6' }}>No QRE data — mark projects as QRE-eligible in the Projects list</td></tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #E2E4E9', background: '#FAFBFC' }}>
                                        <td colSpan={3} className="px-4 py-3 font-bold text-xs" style={{ color: '#3F4450' }}>Total</td>
                                        <td className="px-4 py-3 font-black tabular-nums" style={{ color: '#4141A2' }}>{fmt(data.totalQREWages)}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Project Breakdown */}
                    <div className="glass-card overflow-hidden">
                        <div className="px-5 py-4 border-b" style={{ borderColor: '#E2E4E9' }}>
                            <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>Project QRE Breakdown</h2>
                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>Allocation of QRE wages by project. Toggle projects as QRE-eligible in Projects &amp; Tickets.</p>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr style={{ background: '#FAFBFC', borderBottom: '2px solid #E2E4E9' }}>
                                        {['Project', 'QRE?', 'Allocated QRE Wages'].map(h => (
                                            <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.projects.map((p, i) => (
                                        <tr key={p.projectId} style={{ borderBottom: '1px solid #F0F0F4', background: i % 2 === 0 ? '#FFF' : '#FAFBFC' }}>
                                            <td className="px-4 py-2.5 font-semibold" style={{ color: '#3F4450' }}>{p.projectName}</td>
                                            <td className="px-4 py-2.5">
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: p.isQRE ? '#EBF5EF' : '#F6F6F9', color: p.isQRE ? '#21944E' : '#A4A9B6' }}>
                                                    {p.isQRE ? '✓ QRE' : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums font-bold" style={{ color: '#4141A2' }}>{fmt(p.qreWages)}</td>
                                        </tr>
                                    ))}
                                    {data.projects.length === 0 && (
                                        <tr><td colSpan={3} className="px-4 py-8 text-center text-sm" style={{ color: '#A4A9B6' }}>No project QRE data yet</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Contract Research */}
                    <div className="glass-card overflow-hidden">
                        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#E2E4E9' }}>
                            <div>
                                <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>Contract Research</h2>
                                <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>Third-party R&amp;D spending. 65% of qualifying amounts count as QRE (IRC §41(b)(3)).</p>
                            </div>
                            <button
                                onClick={() => { setShowAddForm(true); setEditingId(null); setForm({ vendor: '', description: '', amount: '', qrePct: '65', period: 'January', year: String(year) }); }}
                                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                style={{ background: '#4141A2', color: '#FFF', border: 'none', cursor: 'pointer' }}
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Entry
                            </button>
                        </div>

                        {/* Add / Edit form */}
                        {showAddForm && (
                            <div className="px-5 py-4 border-b" style={{ borderColor: '#E2E4E9', background: '#FAFBFC' }}>
                                <div className="grid gap-3" style={{ gridTemplateColumns: '2fr 3fr 1fr 1fr 1fr 1fr' }}>
                                    <div>
                                        <label style={labelStyle}>Vendor *</label>
                                        <input style={inputStyle} placeholder="Contractor name" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Description</label>
                                        <input style={inputStyle} placeholder="Nature of research" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Amount *</label>
                                        <input style={inputStyle} placeholder="50000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>QRE % (default 65)</label>
                                        <input style={inputStyle} placeholder="65" value={form.qrePct} onChange={e => setForm(f => ({ ...f, qrePct: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Period</label>
                                        <select style={inputStyle} value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))}>
                                            {PERIODS.map(m => <option key={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Year</label>
                                        <select style={inputStyle} value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}>
                                            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={handleSaveContractor}
                                        disabled={saving || !form.vendor || !form.amount}
                                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                                        style={{ background: saving || !form.vendor || !form.amount ? '#E2E4E9' : '#21944E', color: '#FFF', border: 'none', cursor: saving ? 'wait' : 'pointer' }}
                                    >
                                        <Check className="w-3.5 h-3.5" /> {editingId ? 'Save Changes' : 'Add Entry'}
                                    </button>
                                    <button
                                        onClick={() => { setShowAddForm(false); setEditingId(null); }}
                                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                                        style={{ background: '#F6F6F9', color: '#717684', border: '1px solid #E2E4E9', cursor: 'pointer' }}
                                    >
                                        <X className="w-3.5 h-3.5" /> Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr style={{ background: '#FAFBFC', borderBottom: '2px solid #E2E4E9' }}>
                                    {['Vendor', 'Description', 'Period', 'Contract Amt', 'QRE %', 'QRE Amount', ''].map(h => (
                                        <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.contractors.map((c, i) => (
                                    <tr key={c.id} style={{ borderBottom: '1px solid #F0F0F4', background: i % 2 === 0 ? '#FFF' : '#FAFBFC' }}>
                                        <td className="px-4 py-2.5 font-semibold" style={{ color: '#3F4450' }}>{c.vendor}</td>
                                        <td className="px-4 py-2.5" style={{ color: '#717684' }}>{c.description || '—'}</td>
                                        <td className="px-4 py-2.5" style={{ color: '#717684' }}>{c.period}</td>
                                        <td className="px-4 py-2.5 tabular-nums" style={{ color: '#3F4450' }}>{fmt(c.amount)}</td>
                                        <td className="px-4 py-2.5 tabular-nums" style={{ color: '#D3A236' }}>{pct(c.qrePct)}</td>
                                        <td className="px-4 py-2.5 tabular-nums font-bold" style={{ color: '#21944E' }}>{fmt(c.amount * c.qrePct)}</td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => startEdit(c)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A4A9B6' }}>
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => handleDeleteContractor(c.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A4A9B6' }}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {data.contractors.length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: '#A4A9B6' }}>No contractor research entries yet — click Add Entry to begin</td></tr>
                                )}
                            </tbody>
                            {data.contractors.length > 0 && (
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #E2E4E9', background: '#FAFBFC' }}>
                                        <td colSpan={5} className="px-4 py-3 font-bold text-xs" style={{ color: '#3F4450' }}>Total Contract QRE</td>
                                        <td className="px-4 py-3 font-black tabular-nums" style={{ color: '#21944E' }}>{fmt(data.totalContractQRE)}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            ) : (
                <div className="glass-card p-12 text-center">
                    <FlaskConical className="w-12 h-12 mx-auto mb-4" style={{ color: '#A4A9B6' }} />
                    <h2 className="text-lg font-semibold mb-2" style={{ color: '#3F4450' }}>No Data for {year}</h2>
                    <p className="text-sm" style={{ color: '#A4A9B6' }}>Import payroll periods for {year} and mark projects as QRE-eligible to begin.</p>
                </div>
            )}
        </div>
    );
}
