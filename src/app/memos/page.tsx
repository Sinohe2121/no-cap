'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, Plus, X, ChevronRight, Bot, Loader2, Sparkles, Upload, FileUp } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface Memo {
    id: string;
    title: string;
    category: string;
    year: number;
    createdAt: string;
    updatedAt: string;
}

const CATEGORIES = ['CAPITALIZATION', 'RD_METHODOLOGY', 'ACCOUNTING_POLICY', 'CUSTOM'] as const;
const CATEGORY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    CAPITALIZATION:    { label: 'Capitalization Policy', color: '#4141A2', bg: '#F0EAF8' },
    RD_METHODOLOGY:    { label: 'R&D Methodology',       color: '#21944E', bg: '#EBF5EF' },
    ACCOUNTING_POLICY: { label: 'Accounting Policy',      color: '#D3A236', bg: '#FFF8EB' },
    CUSTOM:            { label: 'Custom',                  color: '#717684', bg: '#F6F6F9' },
};
const MONTHS = [
    null,
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

export default function MemosPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    const [memos, setMemos] = useState<Memo[]>([]);
    const [loading, setLoading] = useState(true);

    // Manual create
    const [showNew, setShowNew] = useState(false);
    const [form, setForm] = useState({ title: '', category: 'CAPITALIZATION', year: String(new Date().getFullYear()) });
    const [saving, setSaving] = useState(false);

    // LLM generate
    const [showLlm, setShowLlm] = useState(false);
    const [llmConfigured, setLlmConfigured] = useState<{ provider: string; model: string | null } | null>(null);
    const [llmForm, setLlmForm] = useState({
        memoType: 'CAPITALIZATION',
        year: String(new Date().getFullYear()),
        month: '',
        title: '',
    });
    const [sampleDoc, setSampleDoc] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [generating, setGenerating] = useState(false);
    const [generateError, setGenerateError] = useState('');

    useEffect(() => {
        fetch('/api/memos')
            .then(r => r.ok ? r.json() : { memos: [] })
            .then(d => setMemos(d.memos || []))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!isAdmin) return;
        fetch('/api/admin/llm-config')
            .then(r => r.ok ? r.json() : { configured: false, provider: '', model: null })
            .then(d => {
                if (d.configured) setLlmConfigured({ provider: d.provider, model: d.model });
            });
    }, [isAdmin]);

    const createMemo = async () => {
        if (!form.title) return;
        setSaving(true);
        const res = await fetch('/api/memos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, year: parseInt(form.year) }),
        });
        if (res.ok) {
            const { memo } = await res.json();
            setMemos(prev => [memo, ...prev]);
            setShowNew(false);
            setForm({ title: '', category: 'CAPITALIZATION', year: String(new Date().getFullYear()) });
        }
        setSaving(false);
    };

    const generateMemo = async () => {
        setGenerating(true);
        setGenerateError('');
        try {
            const fd = new FormData();
            fd.append('memoType', llmForm.memoType);
            fd.append('year', llmForm.year);
            if (llmForm.month) fd.append('month', llmForm.month);
            if (llmForm.title) fd.append('title', llmForm.title);
            fd.append('category', llmForm.memoType);
            if (sampleDoc) fd.append('sampleDoc', sampleDoc);

            const res = await fetch('/api/memos/generate', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) {
                setGenerateError(data.error || 'Generation failed. Please try again.');
                return;
            }
            router.push(`/memos/${data.memo.id}`);
        } catch {
            setGenerateError('Network error — could not reach the server.');
        } finally {
            setGenerating(false);
        }
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) setSampleDoc(file);
    };

    const ACCEPTED = '.pdf,.doc,.docx,.txt,.md';

    // Group by year
    const byYear = memos.reduce<Record<number, Memo[]>>((acc, m) => {
        (acc[m.year] ||= []).push(m);
        return acc;
    }, {});
    const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);

    const inputStyle = { width: '100%', padding: '8px 10px', border: '1.5px solid #E2E4E9', borderRadius: 8, fontSize: 13, color: '#3F4450', background: '#FFF', outline: 'none' };
    const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600 as const, color: '#717684', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-5 h-5" style={{ color: '#3F4450' }} />
                        <h1 className="section-header" style={{ margin: 0 }}>Policy Memos</h1>
                    </div>
                    <p className="section-subtext">Audit-ready memos with live data tables — print to PDF directly from the app</p>
                </div>
                {isAdmin && (
                    <div className="flex items-center gap-2">
                        {llmConfigured && (
                            <button
                                onClick={() => { setShowLlm(true); setShowNew(false); setGenerateError(''); }}
                                className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg"
                                style={{ background: '#F3F0FF', color: '#7B61FF', border: '1.5px solid #E0D9FF', cursor: 'pointer' }}
                            >
                                <Sparkles className="w-4 h-4" />
                                Create using LLM
                            </button>
                        )}
                        <button
                            onClick={() => { setShowNew(true); setShowLlm(false); }}
                            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg"
                            style={{ background: '#3F4450', color: '#FFF', border: 'none', cursor: 'pointer' }}
                        >
                            <Plus className="w-4 h-4" /> New Memo
                        </button>
                    </div>
                )}
            </div>

            {/* ── LLM Generate Panel ── */}
            {showLlm && (
                <div className="glass-card p-5 mb-6" style={{ border: '1.5px solid #7B61FF' }}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4" style={{ color: '#7B61FF' }} />
                            <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>Create using LLM</h2>
                            {llmConfigured && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#F3F0FF', color: '#7B61FF' }}>
                                    {llmConfigured.provider}{llmConfigured.model ? ` · ${llmConfigured.model}` : ''}
                                </span>
                            )}
                        </div>
                        <button onClick={() => setShowLlm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A4A9B6' }}>
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <p className="text-xs mb-4" style={{ color: '#717684' }}>
                        The AI will pull all your project, payroll, and amortization data for the selected period and draft a complete memo using GAAP/IFRS guidelines. You can edit the result before publishing.
                    </p>

                    {/* Form row */}
                    <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
                        <div>
                            <label style={labelStyle}>Document Title <span style={{ color: '#A4A9B6' }}>(optional)</span></label>
                            <input
                                style={inputStyle}
                                placeholder="Auto-generated if blank…"
                                value={llmForm.title}
                                onChange={e => setLlmForm(f => ({ ...f, title: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Memo Type</label>
                            <select style={inputStyle} value={llmForm.memoType} onChange={e => setLlmForm(f => ({ ...f, memoType: e.target.value }))}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c].label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Fiscal Year</label>
                            <select style={inputStyle} value={llmForm.year} onChange={e => setLlmForm(f => ({ ...f, year: e.target.value }))}>
                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Month <span style={{ color: '#A4A9B6' }}>(optional)</span></label>
                            <select style={inputStyle} value={llmForm.month} onChange={e => setLlmForm(f => ({ ...f, month: e.target.value }))}>
                                <option value="">Full Year</option>
                                {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Sample doc upload */}
                    <div className="mb-4">
                        <label style={labelStyle}>Sample / Style Reference Document <span style={{ color: '#A4A9B6' }}>(optional)</span></label>
                        <p className="text-[11px] mb-2" style={{ color: '#A4A9B6' }}>Upload last year’s memo, a draft, or any style guide. The LLM will mirror its tone, structure, and formatting — but use live data for all dollar amounts.</p>

                        {sampleDoc ? (
                            <div
                                className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                                style={{ background: '#F3F0FF', border: '1.5px solid #E0D9FF' }}
                            >
                                <div className="flex items-center gap-2">
                                    <FileUp className="w-4 h-4" style={{ color: '#7B61FF' }} />
                                    <div>
                                        <p className="text-xs font-semibold" style={{ color: '#3F4450' }}>{sampleDoc.name}</p>
                                        <p className="text-[10px]" style={{ color: '#A4A9B6' }}>
                                            {(sampleDoc.size / 1024).toFixed(1)} KB — will be used as style guide
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSampleDoc(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A4A9B6' }}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleFileDrop}
                                className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer transition-all"
                                style={{
                                    padding: '20px 16px',
                                    border: `2px dashed ${dragOver ? '#7B61FF' : '#D0D4DC'}`,
                                    background: dragOver ? '#F3F0FF' : '#FAFAFA',
                                }}
                            >
                                <Upload className="w-5 h-5" style={{ color: dragOver ? '#7B61FF' : '#A4A9B6' }} />
                                <p className="text-xs font-semibold" style={{ color: dragOver ? '#7B61FF' : '#717684' }}>
                                    Drop file here or click to browse
                                </p>
                                <p className="text-[10px]" style={{ color: '#A4A9B6' }}>PDF, DOCX, TXT — max 10 MB</p>
                            </div>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPTED}
                            style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) setSampleDoc(f); }}
                        />
                    </div>

                    {generateError && (
                        <p className="text-xs px-3 py-2 rounded-lg mb-3" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                            {generateError}
                        </p>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={generateMemo}
                            disabled={generating}
                            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg"
                            style={{ background: generating ? '#E2E4E9' : '#7B61FF', color: '#FFF', border: 'none', cursor: generating ? 'wait' : 'pointer' }}
                        >
                            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {generating ? 'Generating draft…' : 'Generate Draft'}
                        </button>
                        <button onClick={() => setShowLlm(false)} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#F6F6F9', color: '#717684', border: '1px solid #E2E4E9', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── New Memo (manual) Form ── */}
            {showNew && (
                <div className="glass-card p-5 mb-6" style={{ border: '1.5px solid #4141A2' }}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>New Policy Memo</h2>
                        <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A4A9B6' }}>
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                        <div>
                            <label style={labelStyle}>Document Title *</label>
                            <input style={inputStyle} placeholder="e.g. Capitalization Policy Memo — FY 2026" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                        </div>
                        <div>
                            <label style={labelStyle}>Category</label>
                            <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c].label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Fiscal Year</label>
                            <select style={inputStyle} value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}>
                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={createMemo}
                            disabled={saving || !form.title}
                            className="text-sm font-semibold px-4 py-2 rounded-lg"
                            style={{ background: saving || !form.title ? '#E2E4E9' : '#4141A2', color: '#FFF', border: 'none', cursor: saving ? 'wait' : 'pointer' }}
                        >
                            {saving ? 'Creating…' : 'Create & Open Editor'}
                        </button>
                        <button onClick={() => setShowNew(false)} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#F6F6F9', color: '#717684', border: '1px solid #E2E4E9', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Memos list ── */}
            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#4141A2', borderTopColor: 'transparent' }} />
                </div>
            ) : memos.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: '#A4A9B6' }} />
                    <h2 className="text-lg font-semibold mb-2" style={{ color: '#3F4450' }}>No memos yet</h2>
                    <p className="text-sm" style={{ color: '#A4A9B6' }}>
                        {isAdmin ? 'Click "New Memo" or "Create using LLM" to get started.' : 'No policy memos have been created yet.'}
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-8">
                    {sortedYears.map(y => (
                        <div key={y}>
                            <div className="flex items-center gap-3 mb-3">
                                <p className="text-xs font-black uppercase tracking-widest" style={{ color: '#A4A9B6' }}>FY {y}</p>
                                <div style={{ flex: 1, height: 1, background: '#E2E4E9' }} />
                            </div>
                            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                                {byYear[y].map(m => {
                                    const cat = CATEGORY_LABELS[m.category] || CATEGORY_LABELS.CUSTOM;
                                    return (
                                        <Link
                                            key={m.id}
                                            href={`/memos/${m.id}`}
                                            className="glass-card p-5 flex items-start justify-between group no-underline transition-shadow hover:shadow-md"
                                            style={{ textDecoration: 'none', borderLeft: `3px solid ${cat.color}` }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cat.bg, color: cat.color }}>
                                                    {cat.label}
                                                </span>
                                                <p className="text-sm font-bold mt-2 mb-1" style={{ color: '#3F4450' }}>{m.title}</p>
                                                <p className="text-[11px]" style={{ color: '#A4A9B6' }}>
                                                    Updated {new Date(m.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: cat.color }} />
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
