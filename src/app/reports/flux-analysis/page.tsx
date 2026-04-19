'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, ArrowRight, Zap, RefreshCw,
    TrendingUp, TrendingDown, Minus,
    Bot, ChevronDown, ChevronUp, Pencil, RotateCcw, Copy, Check,
    ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProjectBreakdown { name: string; status: string; capSP: number; totalCost: number; }
interface TopDev { name: string; count: number; }
interface AmortLine { projectName: string; charge: number; }
interface PeriodData {
    totalTickets: number; totalSP: number; featureSP: number;
    bugSP: number; bugCost: number; taskCost: number;
    capRatio: number; bugRatio: number; avgCycleTime: number;
    activeDevs: number; headcount: number; totalPayroll: number;
    payrollLabel: string | null;
    totalCapitalized: number; totalExpensed: number; totalAmortized: number;
    costPerTicket: number; costPerSP: number; totalAllocated: number;
    projectBreakdown: ProjectBreakdown[];
    topDevs: TopDev[];
    amortByProject: AmortLine[];
}

// ─── Default prompt ───────────────────────────────────────────────────────────
const DEFAULT_FLUX_PROMPT = `You are a Senior Technical Accounting Manager specializing in U.S. GAAP software capitalization (ASC 350-40) and R&D cost analysis. You have been given two periods of financial and engineering data.

Your task is to write a **professional flux analysis commentary** comparing Period A to Period B. For each major line item, explain the *why* behind the movement — not just the magnitude. Cite specific numbers, project names, and developer trends wherever possible.

**Structure your response with these exact sections:**

## Capitalized Software (by Project)
Comment on the total change in capitalized labor. Identify which projects drove increases or decreases. Note any new projects entering amortization or completing development.

## R&D Expense (Expensed Labor)
Explain movements in expensed amounts. Discuss bug SP vs. feature SP shifts and how the capitalization ratio changed.

## Bug Activity
Analyze the change in bug count, bug SP, and bug cost. Highlight whether quality improved or regressed, and estimate the cost impact.

## Payroll & Headcount
Comment on total payroll changes, headcount shifts, and cost per engineer. Identify if higher payroll drove higher output or if productivity changed.

## Engineering Velocity
Examine tickets closed, story points, cost per ticket, and cycle time. Was the team more or less productive period-over-period?

## Amortization
Note any meaningful changes in amortization expense. Call out new products coming on-line or legacy products increasing their amortization burden.

## Summary & Key Risks
Provide 3–5 bullet points summarizing the most material movements and any risks or accounting judgments that management should monitor.

**Tone:** Professional, audit-ready, specific. Avoid generic filler. Every paragraph should reference exact numbers from the data provided.`;

// ─── Utility helpers ──────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt  = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtN = (n: number) => n.toLocaleString();

function monthSpan(sy: number, sm: number, ey: number, em: number) {
    return (ey - sy) * 12 + (em - sm) + 1;
}
function toStartDate(y: number, m: number) { return `${y}-${String(m).padStart(2,'0')}-01`; }
function toEndDate(y: number, m: number) {
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
}
function periodLabel(sy: number, sm: number, ey: number, em: number): string {
    if (sy === ey && sm === em) return `${MONTHS[sm-1].slice(0,3)} ${sy}`;
    if (sy === ey) return `${MONTHS[sm-1].slice(0,3)} – ${MONTHS[em-1].slice(0,3)} ${sy}`;
    return `${MONTHS[sm-1].slice(0,3)} ${sy} – ${MONTHS[em-1].slice(0,3)} ${ey}`;
}

// ─── Month Picker component ───────────────────────────────────────────────────
function MonthPicker({
    title, color, bg, border,
    startYear, startMonth, endYear, endMonth,
    onStartChange, onEndChange,
    minStartAfter, // { year, month } — period B start must be strictly after this
}: {
    title: string; color: string; bg: string; border: string;
    startYear: number; startMonth: number; endYear: number; endMonth: number;
    onStartChange: (y: number, m: number) => void;
    onEndChange: (y: number, m: number) => void;
    minStartAfter?: { year: number; month: number };
}) {
    const [sNavY, setSNavY] = useState(startYear);
    const [eNavY, setENavY] = useState(endYear);

    const sel: React.CSSProperties = {
        width: '100%', padding: '8px 12px', borderRadius: 8,
        border: `1.5px solid ${border}`, background: '#fff',
        fontSize: 13, fontWeight: 600, color: '#3F4450',
        outline: 'none', cursor: 'pointer',
    };

    const startDisabled = (y: number, m: number): boolean => {
        if (minStartAfter) {
            if (y < minStartAfter.year) return true;
            if (y === minStartAfter.year && m <= minStartAfter.month) return true;
        }
        return false;
    };
    const endDisabled = (y: number, m: number): boolean => {
        // end must be >= start within same period
        if (y < startYear || (y === startYear && m < startMonth)) return true;
        return false;
    };

    const YearNav = ({ y, setY }: { y: number; setY: (n: number) => void }) => (
        <div className="flex items-center justify-center gap-2 mb-2">
            <button onClick={() => setY(y - 1)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color, padding: 3, borderRadius: 6 }}>
                <ChevronLeft className="w-4 h-4" />
            </button>
            <span style={{ fontSize: 13, fontWeight: 800, color, minWidth: 48, textAlign: 'center' }}>{y}</span>
            <button onClick={() => setY(y + 1)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color, padding: 3, borderRadius: 6 }}>
                <ChevronRight className="w-4 h-4" />
            </button>
        </div>
    );

    return (
        <div className="rounded-xl p-5" style={{ background: bg, border: `1.5px solid ${border}` }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color }}>{title}</p>
            <div className="grid grid-cols-2 gap-4">
                {/* Start */}
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#717684' }}>Start Month</p>
                    <YearNav y={sNavY} setY={setSNavY} />
                    <select style={sel} value={startMonth} onChange={e => onStartChange(sNavY, parseInt(e.target.value))}>
                        {MONTHS.map((name, i) => (
                            <option key={name} value={i+1} disabled={startDisabled(sNavY, i+1)}>{name}</option>
                        ))}
                    </select>
                    <p className="text-center text-[11px] font-semibold mt-1" style={{ color }}>{MONTHS[startMonth-1].slice(0,3)} {startYear}</p>
                </div>
                {/* End */}
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#717684' }}>End Month</p>
                    <YearNav y={eNavY} setY={setENavY} />
                    <select style={sel} value={endMonth} onChange={e => onEndChange(eNavY, parseInt(e.target.value))}>
                        {MONTHS.map((name, i) => (
                            <option key={name} value={i+1} disabled={endDisabled(eNavY, i+1)}>{name}</option>
                        ))}
                    </select>
                    <p className="text-center text-[11px] font-semibold mt-1" style={{ color }}>{MONTHS[endMonth-1].slice(0,3)} {endYear}</p>
                </div>
            </div>
            {/* Range badge */}
            <div className="mt-4 text-center">
                <span className="text-xs font-bold rounded-full px-3 py-1.5 inline-block" style={{ background: border + '44', color }}>
                    {periodLabel(startYear, startMonth, endYear, endMonth)}
                    {' · '}
                    {monthSpan(startYear, startMonth, endYear, endMonth)} month{monthSpan(startYear, startMonth, endYear, endMonth) !== 1 ? 's' : ''}
                </span>
            </div>
        </div>
    );
}

// ─── Delta badge ──────────────────────────────────────────────────────────────
function Delta({ a, b, invert = false }: { a: number; b: number; invert?: boolean }) {
    if (a === 0 && b === 0) return <span style={{ color: '#A4A9B6' }}>—</span>;
    const diff = b - a;
    const pct  = a === 0 ? null : ((diff / a) * 100).toFixed(1);
    const isUp  = diff > 0;
    const isGood = invert ? !isUp : isUp;
    const color = diff === 0 ? '#A4A9B6' : isGood ? '#21944E' : '#FA4338';
    const Icon  = diff === 0 ? Minus : isUp ? TrendingUp : TrendingDown;
    return (
        <span className="flex items-center justify-end gap-1" style={{ color }}>
            <Icon className="w-3 h-3 flex-shrink-0" />
            {pct !== null ? `${pct}%` : `${diff > 0 ? '+' : ''}${diff}`}
        </span>
    );
}

// ─── Simple markdown renderer ─────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
    return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
            ? <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2,-2)}</strong>
            : part
    );
}
function RenderMarkdown({ md }: { md: string }) {
    const els: React.ReactNode[] = [];
    let k = 0;
    for (const line of md.split('\n')) {
        const t = line.trim();
        if (!t) { els.push(<div key={k++} style={{ height: 8 }} />); continue; }
        if (t.startsWith('## ')) els.push(<h2 key={k++} style={{ fontSize: 15, fontWeight: 800, color: '#3F4450', marginTop: 24, marginBottom: 8, borderBottom: '2px solid #E2E4E9', paddingBottom: 4 }}>{t.slice(3)}</h2>);
        else if (t.startsWith('### ')) els.push(<h3 key={k++} style={{ fontSize: 13, fontWeight: 700, color: '#4141A2', marginTop: 16, marginBottom: 4 }}>{t.slice(4)}</h3>);
        else if (t.startsWith('- ') || t.startsWith('* ')) els.push(<li key={k++} style={{ fontSize: 13, color: '#3F4450', marginLeft: 16, lineHeight: 1.7, listStyleType: 'disc' }}>{renderInline(t.slice(2))}</li>);
        else if (t.startsWith('---')) els.push(<hr key={k++} style={{ border: 'none', borderTop: '1px solid #E2E4E9', margin: '16px 0' }} />);
        else els.push(<p key={k++} style={{ fontSize: 13, color: '#3F4450', lineHeight: 1.75, marginBottom: 4 }}>{renderInline(t)}</p>);
    }
    return <div>{els}</div>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FluxAnalysisPage() {
    const now = new Date();
    const prevM = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    // Period A (base) — defaults to previous month
    const [aStartY, setAStartY] = useState(prevY);
    const [aStartM, setAStartM] = useState(prevM);
    const [aEndY,   setAEndY]   = useState(prevY);
    const [aEndM,   setAEndM]   = useState(prevM);
    // Period B (current) — defaults to current month
    const [bStartY, setBStartY] = useState(now.getFullYear());
    const [bStartM, setBStartM] = useState(now.getMonth() + 1);
    const [bEndY,   setBEndY]   = useState(now.getFullYear());
    const [bEndM,   setBEndM]   = useState(now.getMonth() + 1);

    const [data,    setData]    = useState<{ periodA: PeriodData; periodB: PeriodData } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    // LLM
    const [prompt,          setPrompt]          = useState(DEFAULT_FLUX_PROMPT);
    const [promptEditing,   setPromptEditing]   = useState(false);
    const [draftPrompt,     setDraftPrompt]     = useState(DEFAULT_FLUX_PROMPT);
    const [llmLoading,      setLlmLoading]      = useState(false);
    const [llmError,        setLlmError]        = useState<string | null>(null);
    const [commentary,      setCommentary]      = useState<string | null>(null);
    const [promptCollapsed, setPromptCollapsed] = useState(true);
    const [copied,          setCopied]          = useState(false);
    const commentaryRef = useRef<HTMLDivElement>(null);

    // ── Validation ────────────────────────────────────────────────────────────
    const spanA = monthSpan(aStartY, aStartM, aEndY, aEndM);
    const spanB = monthSpan(bStartY, bStartM, bEndY, bEndM);
    const aEndValid = aEndY > aStartY || (aEndY === aStartY && aEndM >= aStartM);
    const bEndValid = bEndY > bStartY || (bEndY === bStartY && bEndM >= bStartM);
    const bAfterA    = bStartY > aEndY || (bStartY === aEndY && bStartM > aEndM);
    const spansMatch = spanA === spanB;

    const validationError = !aEndValid ? 'Period A: end month must be ≥ start month.'
        : !bEndValid                   ? 'Period B: end month must be ≥ start month.'
        : !bAfterA                     ? 'Period B must start after Period A ends.'
        : !spansMatch                  ? `Period lengths must match — A is ${spanA} month${spanA!==1?'s':''}, B is ${spanB}.`
        : null;

    const canCompare = !validationError;
    const labelA = periodLabel(aStartY, aStartM, aEndY, aEndM);
    const labelB = periodLabel(bStartY, bStartM, bEndY, bEndM);

    // ── Period A start auto-adjust ─────────────────────────────────────────
    const handleAStart = useCallback((y: number, m: number) => {
        setAStartY(y); setAStartM(m);
        if (aEndY < y || (aEndY === y && aEndM < m)) { setAEndY(y); setAEndM(m); }
    }, [aEndY, aEndM]);
    const handleBStart = useCallback((y: number, m: number) => {
        setBStartY(y); setBStartM(m);
        if (bEndY < y || (bEndY === y && bEndM < m)) { setBEndY(y); setBEndM(m); }
    }, [bEndY, bEndM]);

    // ── Data fetching ─────────────────────────────────────────────────────────
    const runComparison = async () => {
        if (!canCompare) return;
        setLoading(true); setError(null); setCommentary(null);
        try {
            const params = new URLSearchParams({
                periodAStart: toStartDate(aStartY, aStartM),
                periodAEnd:   toEndDate(aEndY, aEndM),
                periodBStart: toStartDate(bStartY, bStartM),
                periodBEnd:   toEndDate(bEndY, bEndM),
            });
            const res = await fetch(`/api/reports/period-comparison?${params}`);
            const d   = await res.json();
            if (!res.ok) throw new Error(d.error || 'Failed to load data');
            setData(d);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    const runLLM = async () => {
        if (!data) return;
        setLlmLoading(true); setLlmError(null); setCommentary(null);
        try {
            const res = await fetch('/api/reports/flux-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comparisonData: data, prompt, labelA, labelB }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'LLM failed');
            setCommentary(d.commentary);
            setTimeout(() => commentaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        } catch (e: any) { setLlmError(e.message); }
        finally { setLlmLoading(false); }
    };

    const copyCommentary = async () => {
        if (!commentary) return;
        await navigator.clipboard.writeText(commentary);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
    };

    const METRICS: { label: string; key: keyof PeriodData; fmtFn: (v: number) => string; invert?: boolean }[] = [
        { label: 'Total Tickets',          key: 'totalTickets',     fmtFn: fmtN },
        { label: 'Story Points',           key: 'totalSP',          fmtFn: fmtN },
        { label: 'Feature SP',             key: 'featureSP',        fmtFn: fmtN },
        { label: 'Bug SP',                 key: 'bugSP',            fmtFn: fmtN,          invert: true },
        { label: 'Bug Cost',               key: 'bugCost',          fmtFn: fmt,            invert: true },
        { label: 'Task Cost',              key: 'taskCost',         fmtFn: fmt,            invert: true },
        { label: 'Cap Ratio',              key: 'capRatio',         fmtFn: v => `${v}%` },
        { label: 'Bug Ratio',              key: 'bugRatio',         fmtFn: v => `${v}%`,  invert: true },
        { label: 'Avg Cycle Time (days)',  key: 'avgCycleTime',     fmtFn: v => `${v}d`,  invert: true },
        { label: 'Active Devs',           key: 'activeDevs',        fmtFn: fmtN },
        { label: 'Payroll Headcount',      key: 'headcount',        fmtFn: fmtN },
        { label: 'Total Payroll',          key: 'totalPayroll',     fmtFn: fmt },
        { label: 'Capitalized (JE)',       key: 'totalCapitalized', fmtFn: fmt },
        { label: 'Expensed (JE)',          key: 'totalExpensed',    fmtFn: fmt,            invert: true },
        { label: 'Amortized',             key: 'totalAmortized',    fmtFn: fmt,            invert: true },
        { label: 'Total Allocated',        key: 'totalAllocated',   fmtFn: fmt },
        { label: 'Cost per Ticket',        key: 'costPerTicket',    fmtFn: fmt,            invert: true },
        { label: 'Cost per SP',            key: 'costPerSP',        fmtFn: fmt,            invert: true },
    ];

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <Link href="/accounting" style={{ textDecoration: 'none' }}>
                    <span className="text-xs font-medium flex items-center gap-1 mb-1" style={{ color: '#A4A9B6' }}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Accounting &amp; Reporting
                    </span>
                </Link>
                <h1 className="section-header flex items-center gap-2">
                    <Zap className="w-5 h-5" style={{ color: '#7B61FF' }} />
                    Flux Analysis
                </h1>
                <p className="section-subtext">Period-over-period comparison with AI-powered commentary</p>
            </div>

            {/* ── Period Selectors ─────────────────────────────────────────────── */}
            <div className="glass-card p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <MonthPicker
                        title="Period A (Base)" color="#4141A2" bg="#EEF2FF" border="#D5DAFF"
                        startYear={aStartY} startMonth={aStartM}
                        endYear={aEndY}     endMonth={aEndM}
                        onStartChange={handleAStart}
                        onEndChange={(y, m) => { setAEndY(y); setAEndM(m); }}
                    />
                    <MonthPicker
                        title="Period B (Current)" color="#FA4338" bg="#FFF5F5" border="#FFD5D5"
                        startYear={bStartY} startMonth={bStartM}
                        endYear={bEndY}     endMonth={bEndM}
                        onStartChange={handleBStart}
                        onEndChange={(y, m) => { setBEndY(y); setBEndM(m); }}
                        minStartAfter={{ year: aEndY, month: aEndM }}
                    />
                </div>

                {/* Validation + button */}
                <div className="flex flex-col items-center gap-3 mt-5">
                    {validationError && (
                        <div className="flex items-center gap-2 text-xs font-semibold rounded-lg px-4 py-2.5" style={{ background: '#FFF5F5', color: '#FA4338', border: '1px solid #FFD5D5' }}>
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            {validationError}
                        </div>
                    )}
                    <button
                        onClick={runComparison}
                        disabled={loading || !canCompare}
                        className="btn-primary"
                        style={{ opacity: !canCompare ? 0.5 : 1 }}
                    >
                        {loading
                            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</>
                            : <><ArrowRight className="w-4 h-4" /> Compare {labelA} vs {labelB}</>}
                    </button>
                    {error && <p className="text-sm" style={{ color: '#FA4338' }}>{error}</p>}
                </div>
            </div>

            {/* ── Results ────────────────────────────────────────────────────────── */}
            {data && (
                <div className="space-y-6">

                    {/* Flux Table */}
                    <div className="glass-card" style={{ overflow: 'hidden' }}>
                        <div className="px-6 py-4" style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E4E9' }}>
                            <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>Flux Table</h2>
                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>{labelA} vs {labelB}</p>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                                <thead>
                                    <tr style={{ background: '#F6F6F9', borderBottom: '2px solid #E2E4E9' }}>
                                        <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 200 }}>Metric</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#4141A2', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 130 }}>{labelA}</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#FA4338', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 130 }}>{labelB}</th>
                                        <th style={{ padding: '10px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#717684', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 100 }}>Δ Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {METRICS.map(m => {
                                        const vA = data.periodA[m.key] as number;
                                        const vB = data.periodB[m.key] as number;
                                        return (
                                            <tr key={m.label} style={{ borderBottom: '1px solid #F0F0F5' }}>
                                                <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 600, color: '#3F4450' }}>{m.label}</td>
                                                <td style={{ padding: '11px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#4141A2', fontVariantNumeric: 'tabular-nums' }}>{m.fmtFn(vA)}</td>
                                                <td style={{ padding: '11px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#FA4338', fontVariantNumeric: 'tabular-nums' }}>{m.fmtFn(vB)}</td>
                                                <td style={{ padding: '11px 20px', fontVariantNumeric: 'tabular-nums' }}>
                                                    <Delta a={vA} b={vB} invert={m.invert} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Capitalized Projects side-by-side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {([
                            { label: labelA, proj: data.periodA.projectBreakdown, color: '#4141A2', bg: '#EEF2FF', border: '#D5DAFF' },
                            { label: labelB, proj: data.periodB.projectBreakdown, color: '#FA4338', bg: '#FFF5F5', border: '#FFD5D5' },
                        ] as const).map(({ label, proj, color, bg, border }) => (
                            <div key={label} className="glass-card" style={{ overflow: 'hidden' }}>
                                <div className="px-5 py-3" style={{ background: bg, borderBottom: '1px solid #E2E4E9' }}>
                                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color }}>Capitalized Projects — {label}</p>
                                </div>
                                {proj.length === 0
                                    ? <p className="px-5 py-6 text-sm" style={{ color: '#A4A9B6' }}>No capitalized project activity</p>
                                    : <table className="w-full text-xs">
                                        <thead>
                                            <tr style={{ background: '#F6F6F9', borderBottom: '1px solid #E2E4E9' }}>
                                                <th className="px-5 py-2.5 text-left" style={{ color: '#A4A9B6' }}>Project</th>
                                                <th className="px-3 py-2.5 text-right" style={{ color: '#A4A9B6' }}>Cap SP</th>
                                                <th className="px-5 py-2.5 text-right" style={{ color: '#A4A9B6' }}>Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {proj.map(p => (
                                                <tr key={p.name} style={{ borderBottom: '1px solid #F0F0F5' }}>
                                                    <td className="px-5 py-3" style={{ color: '#3F4450', fontWeight: 600 }}>{p.name}</td>
                                                    <td className="px-3 py-3 text-right" style={{ color: '#717684', fontVariantNumeric: 'tabular-nums' }}>{p.capSP}</td>
                                                    <td className="px-5 py-3 text-right font-bold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.totalCost)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                }
                            </div>
                        ))}
                    </div>

                    {/* Amortization */}
                    {(data.periodA.amortByProject.length > 0 || data.periodB.amortByProject.length > 0) && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {[
                                { label: labelA, items: data.periodA.amortByProject },
                                { label: labelB, items: data.periodB.amortByProject },
                            ].map(({ label, items }) => (
                                <div key={label} className="glass-card" style={{ overflow: 'hidden' }}>
                                    <div className="px-5 py-3" style={{ background: '#FFF4E6', borderBottom: '1px solid #E2E4E9' }}>
                                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#F5A623' }}>Amortization — {label}</p>
                                    </div>
                                    {items.length === 0
                                        ? <p className="px-5 py-6 text-sm" style={{ color: '#A4A9B6' }}>No amortization this period</p>
                                        : <table className="w-full text-xs">
                                            <thead>
                                                <tr style={{ background: '#F6F6F9', borderBottom: '1px solid #E2E4E9' }}>
                                                    <th className="px-5 py-2.5 text-left" style={{ color: '#A4A9B6' }}>Project</th>
                                                    <th className="px-5 py-2.5 text-right" style={{ color: '#A4A9B6' }}>Charge</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map(a => (
                                                    <tr key={a.projectName} style={{ borderBottom: '1px solid #F0F0F5' }}>
                                                        <td className="px-5 py-3" style={{ color: '#3F4450', fontWeight: 600 }}>{a.projectName}</td>
                                                        <td className="px-5 py-3 text-right font-bold" style={{ color: '#F5A623', fontVariantNumeric: 'tabular-nums' }}>{fmt(a.charge)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    }
                                </div>
                            ))}
                        </div>
                    )}

                    {/* LLM Commentary Panel */}
                    <div className="glass-card" style={{ overflow: 'hidden' }}>
                        {/* Header */}
                        <div className="px-6 py-4 flex items-center justify-between" style={{ background: '#F5F3FF', borderBottom: '1px solid #E2E4E9' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#EDE9FE' }}>
                                    <Bot className="w-5 h-5" style={{ color: '#7B61FF' }} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold" style={{ color: '#3F4450' }}>AI Flux Commentary</p>
                                    <p className="text-xs" style={{ color: '#A4A9B6' }}>LLM-powered analysis — uses your AI Configuration provider</p>
                                </div>
                            </div>
                            <button
                                onClick={runLLM}
                                disabled={llmLoading}
                                style={{
                                    background: llmLoading ? '#C4B5FD' : '#7B61FF',
                                    color: '#fff', border: 'none', borderRadius: 10,
                                    padding: '9px 20px', fontSize: 13, fontWeight: 700,
                                    cursor: llmLoading ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                {llmLoading
                                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analyzing…</>
                                    : <><Zap className="w-4 h-4" /> Run LLM Flux Analysis</>}
                            </button>
                        </div>

                        {/* Prompt editor */}
                        <div style={{ borderBottom: '1px solid #E2E4E9' }}>
                            <button
                                onClick={() => setPromptCollapsed(c => !c)}
                                className="w-full flex items-center justify-between px-6 py-3 text-xs font-semibold"
                                style={{ background: '#FAFAFA', color: '#717684', border: 'none', cursor: 'pointer' }}
                            >
                                <span className="flex items-center gap-2"><Pencil className="w-3.5 h-3.5" /> View / Edit Prompt</span>
                                {promptCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            </button>
                            {!promptCollapsed && (
                                <div className="px-6 pb-5 pt-4" style={{ background: '#FAFAFA' }}>
                                    {promptEditing ? (
                                        <>
                                            <textarea
                                                value={draftPrompt}
                                                onChange={e => setDraftPrompt(e.target.value)}
                                                rows={18}
                                                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: '12px 14px', borderRadius: 8, border: '1.5px solid #D5DAFF', background: '#fff', color: '#3F4450', resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
                                            />
                                            <div className="flex items-center gap-3 mt-3">
                                                <button onClick={() => { setPrompt(draftPrompt); setPromptEditing(false); }} style={{ background: '#4141A2', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save Prompt</button>
                                                <button onClick={() => { setDraftPrompt(prompt); setPromptEditing(false); }} style={{ background: '#F6F6F9', color: '#717684', border: '1px solid #E2E4E9', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                                <button onClick={() => { setDraftPrompt(DEFAULT_FLUX_PROMPT); setPrompt(DEFAULT_FLUX_PROMPT); setPromptEditing(false); }} className="flex items-center gap-1.5" style={{ background: 'transparent', color: '#FA4338', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                                    <RotateCcw className="w-3.5 h-3.5" /> Revert to Default
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <pre style={{ fontFamily: 'monospace', fontSize: 11, color: '#717684', whiteSpace: 'pre-wrap', lineHeight: 1.6, background: '#F6F6F9', padding: '12px 14px', borderRadius: 8, border: '1px solid #E2E4E9', maxHeight: 240, overflowY: 'auto' }}>{prompt}</pre>
                                            <div className="flex items-center gap-3 mt-3">
                                                <button onClick={() => { setDraftPrompt(prompt); setPromptEditing(true); }} className="flex items-center gap-1.5" style={{ background: '#EDE9FE', color: '#7B61FF', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                                    <Pencil className="w-3.5 h-3.5" /> Edit Prompt
                                                </button>
                                                {prompt !== DEFAULT_FLUX_PROMPT && (
                                                    <button onClick={() => { setPrompt(DEFAULT_FLUX_PROMPT); setDraftPrompt(DEFAULT_FLUX_PROMPT); }} className="flex items-center gap-1.5" style={{ background: 'transparent', color: '#FA4338', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                                        <RotateCcw className="w-3.5 h-3.5" /> Revert to Default
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Commentary output */}
                        {llmError && (
                            <div className="px-6 py-4" style={{ background: '#FFF5F5' }}>
                                <p className="text-sm font-semibold" style={{ color: '#FA4338' }}>Error: {llmError}</p>
                                {llmError.includes('AI Configuration') && (
                                    <Link href="/admin/llm-config" className="text-xs font-semibold mt-1 inline-block" style={{ color: '#4141A2' }}>→ Go to AI Configuration</Link>
                                )}
                            </div>
                        )}
                        {llmLoading && (
                            <div className="px-6 py-10 flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: '#7B61FF', borderTopColor: 'transparent' }} />
                                <p className="text-sm" style={{ color: '#A4A9B6' }}>Analyzing {labelA} vs {labelB}…</p>
                            </div>
                        )}
                        {commentary && !llmLoading && (
                            <div ref={commentaryRef} className="px-6 py-6">
                                <div className="flex items-center justify-between mb-5">
                                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>LLM Commentary — {labelA} vs {labelB}</p>
                                    <button onClick={copyCommentary} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: copied ? '#21944E' : '#7B61FF', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                        {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                                    </button>
                                </div>
                                <RenderMarkdown md={commentary} />
                            </div>
                        )}
                        {!commentary && !llmLoading && !llmError && (
                            <div className="px-6 py-8 text-center">
                                <Bot className="w-8 h-8 mx-auto mb-2" style={{ color: '#C4B5FD' }} />
                                <p className="text-sm font-semibold" style={{ color: '#717684' }}>Ready to analyze</p>
                                <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>Click "Run LLM Flux Analysis" to generate commentary</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!data && !loading && (
                <div className="glass-card p-12 text-center">
                    <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: '#A4A9B6' }} />
                    <p className="font-semibold" style={{ color: '#3F4450' }}>Select two periods above to compare</p>
                    <p className="text-sm mt-1" style={{ color: '#A4A9B6' }}>
                        Choose the start and end month for Period A and Period B, then click "Compare Periods."
                        Period B must be later than Period A, and both must span the same number of months.
                    </p>
                </div>
            )}
        </div>
    );
}
