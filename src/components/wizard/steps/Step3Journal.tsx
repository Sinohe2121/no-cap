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

interface TieOuts {
    payrollIn: number;
    payrollOut: number;
    payrollDelta: number;
    capJESum: number;
    capTrailSum: number;
    capTrailDelta: number;
    amortJESum: number;
    amortExpected: number;
    amortDelta: number;
}

function fmtUSD(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

type MissingInput = 'payroll' | 'tickets';

export default function Step3Journal() {
    const { period, goTo, markCompleted, close, cancel } = useWizard();
    const [generating, setGenerating] = useState(false);
    const [committed, setCommitted] = useState(false);
    const [data, setData] = useState<GenerateResponse | null>(null);
    const [tieOuts, setTieOuts] = useState<TieOuts | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [missingInputs, setMissingInputs] = useState<MissingInput[]>([]);
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
        setMissingInputs([]);
        try {
            const res = await fetch('/api/accounting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: period.month, year: period.year }),
            });
            const body = await res.json();
            if (!res.ok) {
                if (body?.error === 'period_not_ready' && Array.isArray(body.missing)) {
                    setMissingInputs(body.missing as MissingInput[]);
                    setError(body.message || 'Period not ready for generation.');
                    return;
                }
                throw new Error(body.message || body.error || 'Generation failed');
            }
            setData(body as GenerateResponse);
            setCommitted(true);
            markCompleted('journal');
            // Pull audit pack + amortization context to build the triple tie-out.
            await computeTieOuts(body);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Generation failed');
        } finally {
            setGenerating(false);
        }
    };

    /** Compute payroll → JE, capitalization → audit-trail, and amortization tie-outs. */
    const computeTieOuts = async (gen: GenerateResponse) => {
        try {
            // 1. Payroll tie-out — direct from generation response
            const payrollIn = gen.totalFullyLoadedPayroll ?? 0;
            const payrollOut = (gen.totalCapitalized ?? 0)
                + (gen.totalExpensed ?? 0)
                + (gen.totalAdjustment ?? 0);
            const payrollDelta = payrollIn - payrollOut;

            // 2. Capitalization audit-trail tie-out — fetch the audit pack
            interface AuditPackEntry {
                entryType: string;
                amount: number;
                developerSummary: { amount: number }[];
            }
            const packRes = await fetch(`/api/audit/pack?month=${period.month}&year=${period.year}`);
            const pack: { entries?: AuditPackEntry[] } = packRes.ok ? await packRes.json() : { entries: [] };
            const capJEs = (pack.entries || []).filter(e => e.entryType === 'CAPITALIZATION');
            const capJESum = capJEs.reduce((s, e) => s + e.amount, 0);
            const capTrailSum = capJEs.reduce(
                (s, e) => s + e.developerSummary.reduce((ss, d) => ss + d.amount, 0), 0,
            );
            const capTrailDelta = capJESum - capTrailSum;

            // 3. Amortization tie-out — sum of project-level monthly charges vs JE total
            interface ApiProject {
                allocatedAmount?: number;
                amortizationMonths?: number;
                launchDate?: string | null;
                status?: string;
            }
            const projRes = await fetch('/api/projects');
            const projects: ApiProject[] = projRes.ok ? await projRes.json() : [];
            const periodEnd = new Date(period.year, period.month, 0, 23, 59, 59);
            const amortExpected = projects.reduce((sum, p) => {
                if (!p.launchDate) return sum;
                const launch = new Date(p.launchDate);
                if (launch > periodEnd) return sum;
                const monthly = (p.allocatedAmount ?? 0) / Math.max(1, p.amortizationMonths ?? 36);
                return sum + monthly;
            }, 0);
            const amortJESum = gen.totalAmortization ?? 0;
            const amortDelta = amortExpected - amortJESum;

            setTieOuts({
                payrollIn, payrollOut, payrollDelta,
                capJESum, capTrailSum, capTrailDelta,
                amortJESum, amortExpected, amortDelta,
            });
        } catch {
            // Soft-fail: leave tieOuts null; the existing payroll banner still renders
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

            {error && missingInputs.length === 0 && (
                <div className="p-3 rounded-lg flex items-start gap-2 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {missingInputs.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: '#FFF8EE', border: '1px solid rgba(200,100,32,0.3)' }}>
                    <div className="flex items-start gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5" style={{ color: '#C86420' }} />
                        <div className="flex-1">
                            <p className="text-xs font-bold" style={{ color: '#C86420' }}>Period not ready</p>
                            <p className="text-xs mt-0.5" style={{ color: '#5A4A1A' }}>
                                {error ?? `Missing ${missingInputs.join(' and ')} for ${period.label}.`}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-6">
                        {missingInputs.includes('payroll') && (
                            <button onClick={() => goTo('payroll')} className="btn-ghost text-xs">
                                <ArrowLeft className="w-3.5 h-3.5" /> Import payroll (Step 1)
                            </button>
                        )}
                        {missingInputs.includes('tickets') && (
                            <button onClick={() => goTo('jira')} className="btn-ghost text-xs">
                                <ArrowLeft className="w-3.5 h-3.5" /> Import Jira tickets (Step 2)
                            </button>
                        )}
                    </div>
                </div>
            )}

            {!data && (
                <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E4E9' }}>
                    <button onClick={() => goTo('projects')} className="btn-ghost">
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
                    {/* Triple tie-out control panel */}
                    <div className="rounded-xl p-4 space-y-3" style={{ background: '#F6F6F9', border: '1px solid #E2E4E9' }}>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#3F4450' }}>
                                <Sparkles className="w-3.5 h-3.5" /> Triple Tie-Out — every number must reconcile
                            </p>
                        </div>

                        {/* Check 1 — Payroll → Journal Entry */}
                        <TieOutRow
                            label="Payroll → Journal Entry"
                            description="Fully loaded payroll vs. Capitalization + Expense + Overhead Adj."
                            sourceA={{ label: 'Loaded payroll', value: splitData.payroll }}
                            sourceB={{ label: 'Cap + Exp + Adj', value: splitData.cap + splitData.exp + splitData.adj }}
                            delta={splitData.delta}
                            tolerance={1}
                        />

                        {/* Check 2 — Capitalization → Audit Trail */}
                        {tieOuts && (
                            <TieOutRow
                                label="Capitalization → Audit Trail"
                                description="Sum of CAPITALIZATION entries vs. sum of per-ticket allocations behind them."
                                sourceA={{ label: 'CAPITALIZATION JEs', value: tieOuts.capJESum }}
                                sourceB={{ label: 'Audit-trail allocations', value: tieOuts.capTrailSum }}
                                delta={tieOuts.capTrailDelta}
                                tolerance={0.01}
                            />
                        )}

                        {/* Check 3 — Project schedule → Amortization JE */}
                        {tieOuts && (
                            <TieOutRow
                                label="Project schedule → Amortization JE"
                                description="Sum of monthly amort across launched projects (cost / useful life) vs. AMORTIZATION entries."
                                sourceA={{ label: 'Project monthly amort', value: tieOuts.amortExpected }}
                                sourceB={{ label: 'AMORTIZATION JEs', value: tieOuts.amortJESum }}
                                delta={tieOuts.amortDelta}
                                tolerance={1}
                            />
                        )}

                        {!tieOuts && (
                            <p className="text-[11px] italic" style={{ color: '#A4A9B6' }}>
                                Computing capitalization & amortization tie-outs…
                            </p>
                        )}
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
                        <button onClick={() => goTo('projects')} className="btn-ghost">
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

interface TieOutRowProps {
    label: string;
    description: string;
    sourceA: { label: string; value: number };
    sourceB: { label: string; value: number };
    delta: number;
    tolerance: number;
}

function TieOutRow({ label, description, sourceA, sourceB, delta, tolerance }: TieOutRowProps) {
    const passes = Math.abs(delta) <= tolerance;
    const accent = passes ? '#21944E' : '#C86420';
    const accentBg = passes ? '#EBF5EF' : '#FFF8EE';
    const accentBorder = passes ? 'rgba(33,148,78,0.25)' : 'rgba(200,100,32,0.25)';
    return (
        <div className="rounded-lg p-3" style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
            <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold" style={{ color: '#3F4450' }}>{label}</p>
                <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>
                    {passes ? '✓ Ties out' : `⚠ Δ ${fmtUSD(delta)}`}
                </span>
            </div>
            <p className="text-[10px] mb-2" style={{ color: '#717684' }}>{description}</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: '#A4A9B6' }}>{sourceA.label}</p>
                    <p className="font-bold tabular-nums" style={{ color: '#3F4450' }}>{fmtUSD(sourceA.value)}</p>
                </div>
                <div>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: '#A4A9B6' }}>{sourceB.label}</p>
                    <p className="font-bold tabular-nums" style={{ color: '#3F4450' }}>{fmtUSD(sourceB.value)}</p>
                </div>
            </div>
        </div>
    );
}
