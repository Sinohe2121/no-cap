'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Eye, EyeOff, CheckCircle, XCircle, Loader2, Trash2, RefreshCw, Pencil, RotateCcw, Save } from 'lucide-react';

type Provider = 'openai' | 'anthropic' | 'gemini';

// Default instructions — must stay in sync with DEFAULT_SYSTEM_INSTRUCTIONS in generate/route.ts
const DEFAULT_INSTRUCTIONS = `**Constraints:**
1. **Technical Framework:** For Capitalization memos, apply **ASC 350-40** (Internal-Use Software). For R&D memos, apply **ASC 730** and IRC §41.
2. **Phase Gate Logic:** For capitalization memos, explicitly evaluate each project against the three stages:
   - *Preliminary Project Stage* — expense all costs
   - *Application Development Stage* — capitalize per ASC 350-40-25-1
   - *Post-Implementation Stage* — expense maintenance, capitalize upgrades only
3. **Data Integrity:** Reproduce ALL dollar amounts, project names, developer names, and quantities from the live financial data exactly as provided. Do not alter, estimate, or round them.
4. **Tone:** Professional, objective, and audit-ready. No conversational filler or wrapper text like "Here is the memo:"
5. **Word Count:** 700–1,000 words. Expand Background & Accounting Policy with detailed GAAP analysis.

**Output Structure** (use exact headers — ## for H2, ### for H3):

## Purpose
State the objective for {{PERIOD_LABEL}} regarding {{MEMO_TYPE}}.

## Background & Accounting Policy
Detailed discussion of Internal-Use Software (ASC 350-40). Define **Capitalizable Costs**, **Service Contracts**, and **Upgrades/Enhancements**. Explain the threshold for capitalization.

### Significant Judgments and Estimates
Detail the key accounting judgments and estimates made this period — auditors look here for the most substantive analysis. Include judgments about stage classification, useful life, and any changes from prior periods.

## Development Phase Criteria
List criteria for capitalization under ASC 350-40-25. Reference where "Probable Future Economic Benefit" is established. Map each active project to its current stage.

## Period Activity — {{PERIOD_LABEL}}

### Project Summary *([View live data in app](/accounting/financial-reporting))*
[Insert Project Summary markdown table from live data — reproduce numbers exactly]

### Payroll Summary *([View live data in app](/accounting/financial-reporting))*
[Insert Payroll Summary markdown table from live data — reproduce numbers exactly]

### Developer/QRE Summary *([View live data in app](/rd-credit))*
[Insert Developer/QRE Summary markdown table from live data — reproduce numbers exactly]

## Amortization Method
Detail the **Straight-Line Method** and the **Useful Life** assumption (typically 3–5 years).

### Amortization Schedule *([View live data in app](/accounting/financial-reporting))*
[Insert Amortization Schedule markdown table from live data — reproduce numbers exactly]

## Management Representations
Include standard representations: (1) data is complete and accurate, (2) no significant changes to project scope since last period, (3) compliance with U.S. GAAP.

## Summary
Final conclusion on the total amount capitalized and/or expensed for {{PERIOD_LABEL}}.

---
**Signature:**
__________________________
Chief Financial Officer / Controller`;

const PROVIDERS: { value: Provider; label: string; color: string; bg: string; keyHint: string }[] = [
    { value: 'openai',    label: 'OpenAI',           color: '#10A37F', bg: '#F0FDF9', keyHint: 'sk-...' },
    { value: 'anthropic', label: 'Anthropic (Claude)', color: '#C96442', bg: '#FFF5F0', keyHint: 'sk-ant-...' },
    { value: 'gemini',   label: 'Google Gemini',     color: '#4285F4', bg: '#EFF6FF', keyHint: 'AIza...' },
];

// Anthropic has no public /models endpoint — maintain this list on the frontend
const ANTHROPIC_MODELS = [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-0',
    'claude-sonnet-4-0',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
];

// Min key length before triggering a live model fetch (OpenAI / Gemini only)
const MIN_KEY_LEN: Record<Provider, number> = { openai: 40, anthropic: 0, gemini: 30 };

export default function LlmConfigPage() {
    const [configured, setConfigured]       = useState(false);
    const [currentProvider, setCurrentProvider] = useState<string | null>(null);
    const [currentModel, setCurrentModel]   = useState<string | null>(null);
    const [maskedKey, setMaskedKey]         = useState<string | null>(null);

    const [provider, setProvider] = useState<Provider>('openai');
    const [apiKey, setApiKey]     = useState('');
    const [model, setModel]       = useState('');
    const [showKey, setShowKey]   = useState(false);

    // Dynamic model list
    const [models, setModels]           = useState<string[]>([]);
    const [fetchingModels, setFetchingModels] = useState(false);
    const [modelFetchError, setModelFetchError] = useState('');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [saving, setSaving]           = useState(false);
    const [saveError, setSaveError]     = useState('');
    const [testResult, setTestResult]   = useState<{ ok: boolean; msg: string } | null>(null);
    const [deleting, setDeleting]       = useState(false);
    const [loading, setLoading]         = useState(true);

    // Prompt editor state
    const [savedPrompt, setSavedPrompt]       = useState<string | null>(null); // null = default
    const [promptDraft, setPromptDraft]       = useState(DEFAULT_INSTRUCTIONS);
    const [editingPrompt, setEditingPrompt]   = useState(false);
    const [savingPrompt, setSavingPrompt]     = useState(false);
    const [promptSaveError, setPromptSaveError] = useState('');

    useEffect(() => {
        fetch('/api/admin/llm-config')
            .then(r => r.ok ? r.json() : { configured: false })
            .then(d => {
                if (d.configured) {
                    setConfigured(true);
                    setCurrentProvider(d.provider);
                    setCurrentModel(d.model);
                    setMaskedKey(d.maskedKey);
                    setProvider(d.provider as Provider);
                    setModel(d.model ?? '');
                    // Pre-populate model list when loading existing config
                    if (d.provider === 'anthropic') setModels(ANTHROPIC_MODELS);
                    // Load saved custom prompt
                    if (d.customSystemPrompt) {
                        setSavedPrompt(d.customSystemPrompt);
                        setPromptDraft(d.customSystemPrompt);
                    }
                }
            })
            .finally(() => setLoading(false));
    }, []);

    // Pre-populate Anthropic models immediately (no API call needed)
    useEffect(() => {
        if (provider === 'anthropic') {
            setModels(ANTHROPIC_MODELS);
            setModel(prev => (prev && ANTHROPIC_MODELS.includes(prev)) ? prev : ANTHROPIC_MODELS[0]);
        }
    }, [provider]);

    const fetchModels = useCallback(async (prov: Provider, key: string) => {
        // Anthropic: handled by the useEffect above — no API call needed
        if (prov === 'anthropic') return;
        if (!key || key.length < MIN_KEY_LEN[prov]) {
            setModels([]);
            setModelFetchError('');
            return;
        }
        setFetchingModels(true);
        setModelFetchError('');
        try {
            const res = await fetch('/api/admin/llm-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: prov, apiKey: key }),
            });
            const data = await res.json();
            if (res.ok) {
                setModels(data.models ?? []);
                setModel(prev => (prev && data.models.includes(prev)) ? prev : (data.models[0] ?? ''));
            } else {
                setModelFetchError(data.error ?? 'Failed to fetch models');
                setModels([]);
            }
        } catch {
            setModelFetchError('Network error fetching models');
            setModels([]);
        } finally {
            setFetchingModels(false);
        }
    }, []);

    // Debounce model fetch when key changes (OpenAI / Gemini only)
    useEffect(() => {
        if (provider === 'anthropic') return; // handled by provider useEffect
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setModels([]);
        setModelFetchError('');
        debounceRef.current = setTimeout(() => {
            fetchModels(provider, apiKey);
        }, 800);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [apiKey, provider, fetchModels]);

    const handleProviderChange = (p: Provider) => {
        setProvider(p);
        setModel('');
        setModels([]);
        setModelFetchError('');
        setTestResult(null);
        // Anthropic: pre-populate via useEffect. OpenAI/Gemini: fetch if key present.
        if (p !== 'anthropic' && apiKey.length >= MIN_KEY_LEN[p]) {
            fetchModels(p, apiKey);
        }
    };

    const providerConfig = PROVIDERS.find(p => p.value === provider)!;

    const handleSave = async () => {
        if (!apiKey.trim() || !model) return;
        setSaving(true);
        setSaveError('');
        setTestResult(null);
        try {
            const res = await fetch('/api/admin/llm-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, apiKey: apiKey.trim(), model }),
            });
            let d: any;
            try { d = await res.json(); } catch { d = {}; }
            if (res.ok) {
                setConfigured(true);
                setCurrentProvider(d.provider);
                setCurrentModel(d.model);
                setMaskedKey(d.maskedKey);
                setApiKey('');
                setModels([]);
                setSaveError('');
            } else {
                setSaveError(d.error || `Server error ${res.status} — try restarting the dev server`);
            }
        } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTestResult(null);
        try {
            const res = await fetch('/api/memos/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memoType: 'CUSTOM', year: new Date().getFullYear() }),
            });
            if (res.ok) {
                setTestResult({ ok: true, msg: 'Connection successful — LLM responded correctly.' });
            } else {
                const d = await res.json();
                setTestResult({ ok: false, msg: d.error ?? 'Unknown error from LLM.' });
            }
        } catch {
            setTestResult({ ok: false, msg: 'Network error — could not reach API.' });
        }
    };

    const handleDelete = async () => {
        if (!confirm('Remove the saved API key? This will disable LLM memo generation.')) return;
        setDeleting(true);
        await fetch('/api/admin/llm-config', { method: 'DELETE' });
        setConfigured(false);
        setCurrentProvider(null);
        setCurrentModel(null);
        setMaskedKey(null);
        setDeleting(false);
    };

    const handleSavePrompt = async () => {
        setSavingPrompt(true);
        setPromptSaveError('');
        try {
            const res = await fetch('/api/admin/llm-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customSystemPrompt: promptDraft }),
            });
            const d = await res.json();
            if (res.ok) {
                setSavedPrompt(promptDraft);
                setEditingPrompt(false);
            } else {
                setPromptSaveError(d.error || 'Failed to save prompt');
            }
        } catch {
            setPromptSaveError('Network error');
        } finally {
            setSavingPrompt(false);
        }
    };

    const handleRevertPrompt = async () => {
        if (!confirm('Revert to the system default instructions? Your custom prompt will be deleted.')) return;
        setSavingPrompt(true);
        setPromptSaveError('');
        try {
            const res = await fetch('/api/admin/llm-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customSystemPrompt: null }),
            });
            if (res.ok) {
                setSavedPrompt(null);
                setPromptDraft(DEFAULT_INSTRUCTIONS);
                setEditingPrompt(false);
            }
        } catch {
            setPromptSaveError('Network error');
        } finally {
            setSavingPrompt(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#A4A9B6' }} />
            </div>
        );
    }

    const canSave = !saving && apiKey.trim().length >= 10 && model && !fetchingModels;

    return (
        <div className="max-w-2xl mx-auto">
            {/* Back */}
            <div className="mb-6">
                <Link href="/admin" style={{ textDecoration: 'none' }}>
                    <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#A4A9B6' }}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Admin Portal
                    </span>
                </Link>
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F3F0FF' }}>
                    <Bot className="w-5 h-5" style={{ color: '#7B61FF' }} />
                </div>
                <div>
                    <h1 className="section-header" style={{ marginBottom: 0 }}>AI Configuration</h1>
                    <p className="section-subtext" style={{ marginTop: 2 }}>Configure your LLM provider for automated memo generation</p>
                </div>
            </div>

            {/* Current config */}
            {configured && (
                <div className="glass-card p-4 mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ background: '#21944E' }} />
                        <div>
                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>
                                {PROVIDERS.find(p => p.value === currentProvider)?.label ?? currentProvider}
                                {currentModel && <span className="ml-2 text-xs font-mono" style={{ color: '#A4A9B6' }}>{currentModel}</span>}
                            </p>
                            <p className="text-xs" style={{ color: '#A4A9B6' }}>Key: {maskedKey}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleTest} className="btn-secondary text-xs" style={{ padding: '5px 12px' }}>
                            Test
                        </button>
                        <button onClick={handleDelete} disabled={deleting} className="btn-ghost text-xs" style={{ color: '#FA4338' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Test result */}
            {testResult && (
                <div
                    className="flex items-center gap-2 px-4 py-3 rounded-xl mb-5 text-sm font-medium"
                    style={{ background: testResult.ok ? '#EBF5EF' : '#FFF5F5', color: testResult.ok ? '#21944E' : '#FA4338' }}
                >
                    {testResult.ok
                        ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        : <XCircle className="w-4 h-4 flex-shrink-0" />
                    }
                    {testResult.msg}
                </div>
            )}

            {/* Form */}
            <div className="glass-card p-6">
                <h2 className="text-sm font-bold mb-5" style={{ color: '#3F4450' }}>
                    {configured ? 'Update API Key' : 'Connect an LLM Provider'}
                </h2>

                {/* Provider selector */}
                <div className="mb-5">
                    <label className="form-label">Provider</label>
                    <div className="grid grid-cols-3 gap-3 mt-1">
                        {PROVIDERS.map(p => (
                            <button
                                key={p.value}
                                onClick={() => handleProviderChange(p.value)}
                                className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all"
                                style={{
                                    borderColor: provider === p.value ? p.color : '#E2E4E9',
                                    background: provider === p.value ? p.bg : '#FFFFFF',
                                    color: provider === p.value ? p.color : '#717684',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* API Key — comes first so we can fetch models */}
                <div className="mb-5">
                    <label className="form-label">API Key</label>
                    <div className="relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder={configured ? `Enter new key to replace current… (${providerConfig.keyHint})` : providerConfig.keyHint}
                            className="form-input"
                            autoComplete="off"
                            data-lpignore="true"
                            style={{ paddingRight: 40, fontFamily: 'monospace', fontSize: 13 }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowKey(s => !s)}
                            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#A4A9B6', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: '#A4A9B6' }}>
                        Keys are stored in your database and only accessible to admins.
                    </p>
                </div>

                {/* Model — dynamically populated */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-1">
                        <label className="form-label" style={{ marginBottom: 0 }}>Model</label>
                        {fetchingModels && (
                            <span className="flex items-center gap-1 text-[11px]" style={{ color: '#A4A9B6' }}>
                                <RefreshCw className="w-3 h-3 animate-spin" /> Fetching models…
                            </span>
                        )}
                        {!fetchingModels && models.length > 0 && (
                            <span className="text-[11px]" style={{ color: '#21944E' }}>
                                {models.length} models found
                            </span>
                        )}
                        {provider === 'anthropic' && !fetchingModels && (
                            <span className="text-[11px]" style={{ color: '#A4A9B6' }}>
                                Curated list (Anthropic has no models API)
                            </span>
                        )}
                    </div>
                    {models.length > 0 ? (
                        <select
                            value={model}
                            onChange={e => setModel(e.target.value)}
                            className="form-select"
                        >
                            {models.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    ) : (
                        <input
                            type="text"
                            value={model}
                            onChange={e => setModel(e.target.value)}
                            placeholder={
                                fetchingModels
                                    ? 'Loading…'
                                    : modelFetchError
                                        ? 'Could not load models — type model name manually'
                                        : apiKey.length < MIN_KEY_LEN[provider]
                                            ? 'Enter your API key above to load available models…'
                                            : 'Type a model name…'
                            }
                            className="form-input"
                            autoComplete="off"
                            data-lpignore="true"
                            style={{ fontFamily: 'monospace', fontSize: 13 }}
                        />
                    )}
                    {modelFetchError && (
                        <p className="text-xs mt-1" style={{ color: '#FA4338' }}>⚠ {modelFetchError}</p>
                    )}
                </div>

                <button
                    onClick={handleSave}
                    disabled={!canSave}
                    className="btn-primary w-full"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {saving ? 'Saving…' : configured ? 'Update Key' : 'Save & Enable'}
                </button>
                {saveError && (
                    <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl text-xs" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                        <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{saveError}</span>
                    </div>
                )}
            </div>

            {/* Prompt editor */}
            {configured && (
                <div className="glass-card p-6 mt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>LLM Generation Instructions</h2>
                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>
                                These instructions tell the LLM how to structure and format the memo.
                                Use <code style={{ fontFamily: 'monospace', background: '#F3F0FF', padding: '1px 5px', borderRadius: 4 }}>{'{{PERIOD_LABEL}}'}</code> to reference the selected period.
                            </p>
                        </div>
                        <span
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                            style={{
                                background: savedPrompt ? '#EEF4FF' : '#EBF5EF',
                                color: savedPrompt ? '#4141A2' : '#21944E',
                            }}
                        >
                            {savedPrompt ? 'Custom' : 'Default'}
                        </span>
                    </div>

                    <textarea
                        value={editingPrompt ? promptDraft : (savedPrompt ?? DEFAULT_INSTRUCTIONS)}
                        onChange={e => setPromptDraft(e.target.value)}
                        readOnly={!editingPrompt}
                        rows={18}
                        className="form-input"
                        style={{
                            fontFamily: 'monospace',
                            fontSize: 12,
                            lineHeight: 1.6,
                            resize: 'vertical',
                            background: editingPrompt ? '#FFFFFF' : '#F9F9FB',
                            color: editingPrompt ? '#1C1E26' : '#717684',
                            cursor: editingPrompt ? 'text' : 'default',
                        }}
                    />

                    {promptSaveError && (
                        <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl text-xs" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>{promptSaveError}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-2 mt-4">
                        {!editingPrompt ? (
                            <>
                                <button
                                    onClick={() => { setPromptDraft(savedPrompt ?? DEFAULT_INSTRUCTIONS); setEditingPrompt(true); setPromptSaveError(''); }}
                                    className="btn-secondary flex items-center gap-1.5 text-xs"
                                >
                                    <Pencil className="w-3.5 h-3.5" /> Edit Instructions
                                </button>
                                {savedPrompt && (
                                    <button
                                        onClick={handleRevertPrompt}
                                        disabled={savingPrompt}
                                        className="btn-ghost flex items-center gap-1.5 text-xs"
                                        style={{ color: '#717684' }}
                                    >
                                        {savingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                        Revert to Default
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={handleSavePrompt}
                                    disabled={savingPrompt || !promptDraft.trim()}
                                    className="btn-primary flex items-center gap-1.5 text-xs"
                                    style={{ padding: '8px 16px' }}
                                >
                                    {savingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {savingPrompt ? 'Saving…' : 'Save Instructions'}
                                </button>
                                <button
                                    onClick={() => { setEditingPrompt(false); setPromptSaveError(''); setPromptDraft(savedPrompt ?? DEFAULT_INSTRUCTIONS); }}
                                    className="btn-ghost text-xs"
                                    style={{ color: '#717684' }}
                                >
                                    Cancel
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Info */}
            <div className="mt-6 rounded-xl p-4 text-xs" style={{ background: '#F6F6F9', color: '#717684' }}>
                <p className="font-semibold mb-1" style={{ color: '#3F4450' }}>How memo generation works</p>
                <p>When you click <strong>Create using LLM</strong> on the Policy Memos page, the system fetches all period data (projects, payroll, QRE, amortization) and sends it to your configured LLM with a GAAP/IFRS-compliant prompt. The result is saved as a fully editable draft memo.</p>
            </div>
        </div>
    );
}
