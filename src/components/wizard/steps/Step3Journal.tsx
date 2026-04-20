'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calculator, CheckCircle2, AlertTriangle, ChevronRight, Sparkles, Hexagon, Square, Diamond } from 'lucide-react';
import { useWizard } from '@/context/WizardContext';

interface PreviewEntry {
    entryType: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    description: string;
    projectName: string;
}

interface GenerateResponse {
    totalCapitalized: number;
    totalExpensed: number;
    totalAmortization: number;
    totalFullyLoadedPayroll?: number;
    totalExpensedBugs?: number;
    totalExpensedTasks?: number;
    totalAdjustment?: number;
    controlDelta?: number;
    entries?: PreviewEntry[];
}

function fmtUSD(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

export default function Step3Journal() {
    const { period, goTo, markCompleted, close, cancel } = useWizard();
    const [generating, setGenerating] = useState(false);
    const [committed, setCommitted] = useState(false);
    const [data, setData] = useState<GenerateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [periodStatus, setPeriodStatus] = useState<'OPEN' | 'CLOSED' | 'NEW'>('NEW');

    useEffect(() => {
        if (!period) return;
        // Check if entries already exist for this period
        fetch('/api/accounting')
            .then(r => r.ok ? r.json() : [])
            .then((periods: { month: number; year: number; status: 'OPEN' | 'CLOSED'; journalEntries: unknown[] }[]) => {
                const existing = periods.find(p => p.month === period.month && p.year === period.year);
                if (existing) {
                    setPeriodStatus(existing.status);
                    if (existing.journalEntries.length > 0) setCommitted(true);
                }
            });
    }, [period]);

    if (!period) {
        return (
            <div className="rounded-xl p-4 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                No period selected. Go back to Step 1.
            </div>
        );
    }

    const generate = async () => {
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch('/api/accounting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: period.month, year: period.year }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Generation failed');
            setData(body as GenerateResponse);
            setCommitted(true);
            markCompleted('journal');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Generation failed');
        } finally {
            setGenerating(false);
        }
    };

    const splitData = useMemo(() => {
        if (!data) return null;
        const payroll = data.totalFullyLoadedPayroll ?? 0;
        const cap = data.totalCapitalized ?? 0;
        const exp = data.totalExpensed ?? 0;
        const adj = data.totalAdjustment ?? 0;
        const totalAccounted = cap + exp + adj;
        const capPct = totalAccounted > 0 ? (cap / totalAccounted) * 100 : 0;
        const expPct = totalAccounted > 0 ? (exp / totalAccounted) * 100 : 0;
        const adjPct = totalAccounted > 0 ? (adj / totalAccounted) * 100 : 0;
        return { payroll, cap, exp, adj, capPct, expPct, adjPct, totalAccounted, delta: data.controlDelta ?? 0 };
    }, [data]);

    const capitalizationProjects = useMemo(() => {
        if (!data?.entries) return [];
        const map = new Map<string, number>();
        for (const e of data.entries) {
            if (e.entryType === 'CAPITALIZATION') {
                map.set(e.projectName, (map.get(e.projectName) || 0) + e.amount);
            }
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [data]);

    const amortizingProjects = useMemo(() => {
        if (!data?.entries) return [];
        const map = new Map<string, number>();
        for (const e of data.entries) {
            if (e.entryType === 'AMORTIZATION') {
                map.set(e.projectName, (map.get(e.projectName) || 0) + e.amount);
            }
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [data]);

    const expenseBreakdown = useMemo(() => {
        if (!data?.entries) return { bugs: 0, tasks: 0, other: 0 };
        let bugs = 0, tasks = 0, other = 0;
        for (const e of data.entries) {
            if (e.entryType === 'EXPENSE_BUG') bugs += e.amount;
            else if (e.entryType === 'EXPENSE_TASK') tasks += e.amount;
            else if (e.entryType === 'EXPENSE') other += e.amount;
        }
        return { bugs, tasks, other };
    }, [data]);

    return (
        <div className="space-y-5">
            {/* Period header */}
            <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: '#F0EAF8', border: '1px solid rgba(65,65,162,0.2)' }}>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#4141A2' }}>
                        Generating journal entry for
                    </p>
                    <p className="text-xl font-bold mt-0.5" style={{ color: '#3F4450' }}>{period.label}</p>
                </div>
                {periodStatus === 'CLOSED' && (
                    <span className="badge" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                        Period CLOSED
                    </span>
                )}
            </div>

            {periodStatus === 'CLOSED' && (
                <div className="rounded-lg p-3 flex items-start gap-2 text-xs" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <span>This period is locked. Reopen it from the Journal Entries page before generating.</span>
                </div>
            )}

            {!data && !committed && (
                <div className="rounded-xl p-5" style={{ background: '#FFFCEB', border: '1px solid #F5E6A3' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#8B7020' }}>
                        What this step does
                    </p>
                    <ul className="text-xs space-y-1.5" style={{ color: '#5A4A1A' }}>
                        <li>• Pulls payroll for {period.label} and allocates each developer&apos;s fully loaded cost across imported tickets.</li>
                        <li>• Splits cost into <strong>Capitalization</strong>, <strong>Expense — Bugs</strong>, <strong>Expense — Tasks</strong>, and an <strong>Overhead Adjustment</strong> for unallocated time.</li>
                        <li>• Computes monthly amortization for every project that went live in or before {period.label}.</li>
                        <li>• Posts double-entry journal entries (DR/CR pairs) into the period.</li>
                    </ul>
                </div>
            )}

            {error && (
                <div className="p-3 rounded-lg flex items-start gap-2 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {!data && (
                <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E4E9' }}>
                    <button onClick={() => goTo('jira')} className="btn-ghost">
                        <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                        onClick={generate}
                        disabled={generating || periodStatus === 'CLOSED'}
                        className="btn-primary"
                    >
                        <Calculator className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                        {generating ? 'Calculating…' : committed ? 'Re-generate Entries' : 'Generate Entries'}
                    </button>
                </div>
            )}

            {/* ── Results ── */}
            {data && splitData && (
                <>
                    {/* Tie-out control */}
                    <div
                        className="rounded-xl p-4"
                        style={{
                            background: Math.abs(splitData.delta) < 1 ? '#EBF5EF' : '#FFF8EE',
                            border: `1px solid ${Math.abs(splitData.delta) < 1 ? 'rgba(33,148,78,0.25)' : 'rgba(200,100,32,0.25)'}`,
                        }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#3F4450' }}>
                                <Sparkles className="w-3.5 h-3.5" /> Payroll Tie-Out Control
                            </p>
                            <span style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: Math.abs(splitData.delta) < 1 ? '#21944E' : '#C86420',
                            }}>
                                {Math.abs(splitData.delta) < 1 ? '✓ Ties out' : `⚠ Δ ${fmtUSD(splitData.delta)}`}
                            </span>
                        </div>
                        <p className="text-[11px]" style={{ color: '#717684' }}>
                            <strong style={{ color: '#3F4450' }}>{fmtUSD(splitData.payroll)}</strong> in fully loaded payroll
                            {' '}allocated as <strong style={{ color: '#21944E' }}>{fmtUSD(splitData.cap)}</strong> capitalized
                            {' '}+ <strong style={{ color: '#FA4338' }}>{fmtUSD(splitData.exp)}</strong> expensed
                            {splitData.adj !== 0 && <> + <strong style={{ color: '#4141A2' }}>{fmtUSD(splitData.adj)}</strong> overhead adj.</>}
                        </p>
                    </div>

                    {/* Cap vs expense bar */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>
                                Salary Distribution
                            </p>
                            <p className="text-[11px]" style={{ color: '#717684' }}>
                                {splitData.capPct.toFixed(1)}% cap · {splitData.expPct.toFixed(1)}% exp
                                {splitData.adjPct > 0 && <> · {splitData.adjPct.toFixed(1)}% adj</>}
                            </p>
                        </div>
                        <div className="flex h-3 rounded-full overflow-hidden" style={{ background: '#F0F1F3' }}>
                            <div style={{ width: `${splitData.capPct}%`, background: '#21944E' }} />
                            <div style={{ width: `${splitData.expPct}%`, background: '#FA4338' }} />
                            {splitData.adjPct > 0 && <div style={{ width: `${splitData.adjPct}%`, background: '#4141A2' }} />}
                        </div>
                    </div>

                    {/* Three column summary */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl p-3" style={{ background: '#EBF5EF' }}>
                            <Hexagon className="w-4 h-4 mb-1" fill="currentColor" style={{ color: '#21944E' }} />
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#21944E' }}>
                                Capitalized
                            </p>
                            <p className="text-lg font-bold tabular-nums" style={{ color: '#3F4450' }}>{fmtUSD(splitData.cap)}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: '#717684' }}>{capitalizationProjects.length} project{capitalizationProjects.length === 1 ? '' : 's'}</p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: '#FFF5F5' }}>
                            <Square className="w-4 h-4 mb-1" fill="currentColor" style={{ color: '#FA4338' }} />
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#FA4338' }}>
                                Expensed
                            </p>
                            <p className="text-lg font-bold tabular-nums" style={{ color: '#3F4450' }}>{fmtUSD(splitData.exp)}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: '#717684' }}>
                                {fmtUSD(expenseBreakdown.bugs)} bugs · {fmtUSD(expenseBreakdown.tasks)} tasks
                            </p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: '#F0EAF8' }}>
                            <Diamond className="w-4 h-4 mb-1" fill="currentColor" style={{ color: '#4141A2' }} />
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#4141A2' }}>
                                Amortization
                            </p>
                            <p className="text-lg font-bold tabular-nums" style={{ color: '#3F4450' }}>{fmtUSD(data.totalAmortization)}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: '#717684' }}>{amortizingProjects.length} live project{amortizingProjects.length === 1 ? '' : 's'}</p>
                        </div>
                    </div>

                    {/* Capitalization detail */}
                    {capitalizationProjects.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#A4A9B6' }}>
                                Capitalized projects
                            </h4>
                            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9' }}>
                                <table className="w-full text-xs">
                                    <tbody>
                                        {capitalizationProjects.map(([name, amt], i) => (
                                            <tr key={name} style={{ borderTop: i > 0 ? '1px solid #E2E4E9' : 'none' }}>
                                                <td className="px-3 py-2" style={{ color: '#3F4450' }}>{name}</td>
                                                <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: '#21944E' }}>{fmtUSD(amt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Amortization detail (projects closed in earlier periods) */}
                    {amortizingProjects.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#A4A9B6' }}>
                                Projects amortizing this period (launched in a prior period)
                            </h4>
                            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9' }}>
                                <table className="w-full text-xs">
                                    <tbody>
                                        {amortizingProjects.map(([name, amt], i) => (
                                            <tr key={name} style={{ borderTop: i > 0 ? '1px solid #E2E4E9' : 'none' }}>
                                                <td className="px-3 py-2" style={{ color: '#3F4450' }}>{name}</td>
                                                <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: '#4141A2' }}>{fmtUSD(amt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Success + finish */}
                    <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: '#EBF5EF', border: '1px solid rgba(33,148,78,0.2)' }}>
                        <CheckCircle2 className="w-5 h-5" style={{ color: '#21944E' }} />
                        <div className="flex-1">
                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>
                                Journal entries posted for {period.label}.
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#717684' }}>
                                Review or download from the Journal Entries page.
                            </p>
                        </div>
                        <Link href="/accounting/journal-entries" className="btn-ghost text-xs" onClick={() => close()}>
                            Open Journal Entries <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>

                    <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E4E9' }}>
                        <button onClick={() => goTo('jira')} className="btn-ghost">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button onClick={() => { cancel(); }} className="btn-primary">
                            Finish Wizard
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
