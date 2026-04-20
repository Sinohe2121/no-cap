'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Check, AlertCircle, ArrowRight, FileSpreadsheet, Users, DollarSign, RefreshCw } from 'lucide-react';
import { useWizard } from '@/context/WizardContext';

const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

interface PayrollPeriodRef {
    id: string;
    label: string;
    payDate: string;
    year: number;
}

interface ParsedRow {
    name: string;
    email: string;
    grossSalary: string;
    sbcAmount: string;
}

interface UnmatchedDev { name: string; email: string }

function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const splitLine = (line: string) => {
        const out: string[] = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQ) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (ch === '"') { inQ = false; }
                else { cur += ch; }
            } else {
                if (ch === '"') inQ = true;
                else if (ch === ',') { out.push(cur.trim()); cur = ''; }
                else cur += ch;
            }
        }
        out.push(cur.trim());
        return out;
    };
    const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const vals = splitLine(line);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^['"]|['"]$/g, ''); });
        return row;
    });
}

function stripCurrency(v: string) { return (v || '').replace(/[\$,\s]/g, ''); }

function normalizeRows(text: string): ParsedRow[] {
    return parseCSV(text).map(row => ({
        name: row['name'] || row['user name'] || row['username'] || row['developer'] || '',
        email: (row['email'] || row['work email'] || row['identifying email'] || row['user email'] || row['workemail'] || '').trim().toLowerCase(),
        grossSalary: stripCurrency(row['salary'] || row['gross salary'] || row['employee gross pay'] || row['amount'] || row['grosssalary'] || row['pay'] || '0'),
        sbcAmount: stripCurrency(row['sbc'] || row['stock based compensation'] || row['stock comp'] || row['sbc expense'] || '0'),
    }));
}

function fmtUSD(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

/**
 * Compute the next month after the most-recent imported payroll period.
 * Returns null if there are no imports yet.
 */
function nextPeriodAfter(imports: PayrollPeriodRef[]): { month: number; year: number; label: string } | null {
    if (imports.length === 0) return null;
    const latest = [...imports].sort((a, b) => (a.payDate < b.payDate ? 1 : -1))[0];
    const parts = String(latest.payDate).split('T')[0].split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    return { month: nextMonth, year: nextYear, label: `${MONTH_NAMES[nextMonth - 1]} ${nextYear}` };
}

export default function Step1Payroll() {
    const { period, setPeriod, goTo, markCompleted } = useWizard();

    const [imports, setImports] = useState<PayrollPeriodRef[]>([]);
    const [loadingPeriods, setLoadingPeriods] = useState(true);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [unmatched, setUnmatched] = useState<UnmatchedDev[] | null>(null);
    const [selectedUnmatched, setSelectedUnmatched] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [overrideEnabled, setOverrideEnabled] = useState(false);
    const [overrideMonth, setOverrideMonth] = useState<number | ''>('');
    const [overrideYear, setOverrideYear] = useState<number>(new Date().getFullYear());

    const fileRef = useRef<HTMLInputElement>(null);

    // Load existing periods, suggest the next one, persist into wizard period
    useEffect(() => {
        setLoadingPeriods(true);
        fetch('/api/payroll-register/periods')
            .then(r => r.ok ? r.json() : [])
            .then((data: PayrollPeriodRef[]) => {
                const arr = Array.isArray(data) ? data : [];
                setImports(arr);
                if (!period) {
                    const next = nextPeriodAfter(arr) || (() => {
                        const now = new Date();
                        return { month: now.getMonth() + 1, year: now.getFullYear(), label: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}` };
                    })();
                    setPeriod(next);
                }
            })
            .finally(() => setLoadingPeriods(false));
    }, [period, setPeriod]);

    const latestImported = useMemo(() => {
        if (imports.length === 0) return null;
        return [...imports].sort((a, b) => (a.payDate < b.payDate ? 1 : -1))[0];
    }, [imports]);

    const totals = useMemo(() => {
        let people = 0;
        let dollars = 0;
        const seen = new Set<string>();
        for (const r of parsedRows) {
            const salary = parseFloat(r.grossSalary || '0') || 0;
            const sbc = parseFloat(r.sbcAmount || '0') || 0;
            if (r.email && !seen.has(r.email)) { seen.add(r.email); people += 1; }
            dollars += salary + sbc;
        }
        return { people, dollars };
    }, [parsedRows]);

    const handleFile = async (file: File) => {
        setCsvFile(file);
        setError(null);
        setResult(null);
        setUnmatched(null);
        try {
            const text = await file.text();
            const rows = normalizeRows(text);
            if (rows.length === 0) {
                setError('No rows detected in this CSV. Verify the headers and try again.');
                setParsedRows([]);
                return;
            }
            setParsedRows(rows);
        } catch {
            setError('Failed to read the CSV file.');
            setParsedRows([]);
        }
    };

    const checkUnmatched = async () => {
        try {
            const res = await fetch('/api/developers');
            const data = await res.json();
            const existing = new Set<string>(
                (data.developers || data || []).map((d: { email?: string }) => (d.email || '').toLowerCase())
            );
            const seen = new Set<string>();
            const out: UnmatchedDev[] = [];
            for (const r of parsedRows) {
                if (r.email && !existing.has(r.email) && !seen.has(r.email)) {
                    out.push({ name: r.name, email: r.email });
                    seen.add(r.email);
                }
            }
            setUnmatched(out);
            setSelectedUnmatched(new Set(out.map(d => d.email)));
            return out;
        } catch {
            setError('Failed to load existing developer roster.');
            return null;
        }
    };

    const commit = async () => {
        if (!period || parsedRows.length === 0) return;
        setSubmitting(true);
        setError(null);
        try {
            // First: ensure unmatched check has run
            let unmatchedList = unmatched;
            if (unmatchedList === null) {
                unmatchedList = await checkUnmatched();
                if (unmatchedList === null) { setSubmitting(false); return; }
                if (unmatchedList.length > 0) { setSubmitting(false); return; } // surface review UI
            }

            // Create selected new developers
            if (unmatchedList.length > 0 && selectedUnmatched.size > 0) {
                const toCreate = unmatchedList.filter(d => selectedUnmatched.has(d.email));
                await fetch('/api/developers/bulk-create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ developers: toCreate }),
                });
            }

            // Build payDate = last day of selected period
            const payDate = new Date(period.year, period.month, 0).toISOString().split('T')[0];
            const res = await fetch('/api/payroll-register/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: period.label, payDate, rows: parsedRows }),
            });
            const data = await res.json();
            const r = {
                imported: data.imported ?? 0,
                skipped: data.skipped ?? 0,
                errors: data.errors ?? (data.error ? [data.error] : []),
            };
            setResult(r);
            if (r.errors.length === 0 && r.imported > 0) {
                markCompleted('payroll');
            }
        } catch {
            setResult({ imported: 0, skipped: 0, errors: ['Import failed unexpectedly'] });
        } finally {
            setSubmitting(false);
        }
    };

    const applyOverride = () => {
        if (overrideMonth === '') return;
        const mi = Number(overrideMonth);
        setPeriod({ month: mi, year: overrideYear, label: `${MONTH_NAMES[mi - 1]} ${overrideYear}` });
        setOverrideEnabled(false);
    };

    if (loadingPeriods) {
        return <p className="text-sm" style={{ color: '#717684' }}>Loading payroll periods…</p>;
    }

    return (
        <div className="space-y-6">
            {/* Period banner */}
            <div className="rounded-xl p-4" style={{ background: '#F0EAF8', border: '1px solid rgba(65,65,162,0.2)' }}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#4141A2' }}>
                            Suggested next pay period
                        </p>
                        <p className="text-xl font-bold mt-0.5" style={{ color: '#3F4450' }}>
                            {period?.label ?? '—'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#717684' }}>
                            {latestImported
                                ? <>Last imported: <strong style={{ color: '#3F4450' }}>{latestImported.label}</strong>. The next pay period after that is <strong style={{ color: '#4141A2' }}>{period?.label}</strong>.</>
                                : <>No payroll has been imported yet. Defaulting to the current month.</>}
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setOverrideEnabled(o => !o);
                            if (period) {
                                setOverrideMonth(period.month);
                                setOverrideYear(period.year);
                            }
                        }}
                        className="btn-ghost text-xs"
                        style={{ flexShrink: 0 }}
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Change
                    </button>
                </div>

                {overrideEnabled && (
                    <div className="flex items-end gap-3 mt-3 pt-3" style={{ borderTop: '1px solid rgba(65,65,162,0.15)' }}>
                        <div>
                            <label className="form-label">Month</label>
                            <select
                                value={overrideMonth}
                                onChange={e => setOverrideMonth(e.target.value === '' ? '' : Number(e.target.value))}
                                className="form-select"
                            >
                                <option value="">Select…</option>
                                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="form-label">Year</label>
                            <input
                                type="number"
                                value={overrideYear}
                                onChange={e => setOverrideYear(Number(e.target.value))}
                                className="form-input"
                                style={{ width: 100 }}
                            />
                        </div>
                        <button onClick={applyOverride} className="btn-primary text-xs" disabled={overrideMonth === ''}>
                            Apply
                        </button>
                    </div>
                )}
            </div>

            {/* Upload */}
            <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#A4A9B6' }}>
                    1. Upload Payroll CSV
                </h4>
                <p className="text-xs mb-3" style={{ color: '#717684' }}>
                    Required columns: <strong>name</strong>, <strong>work email</strong>, <strong>employee gross pay</strong>, <strong>sbc</strong>.
                </p>

                <div
                    className="rounded-xl p-6 text-center border-2 border-dashed cursor-pointer transition-colors"
                    style={{
                        borderColor: csvFile ? '#21944E' : '#E2E4E9',
                        background: csvFile ? '#EBF5EF' : '#F6F6F9',
                    }}
                    onClick={() => fileRef.current?.click()}
                >
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                    {csvFile ? (
                        <div>
                            <Check className="w-6 h-6 mx-auto mb-2" style={{ color: '#21944E' }} />
                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{csvFile.name}</p>
                            <p className="text-xs" style={{ color: '#A4A9B6' }}>{(csvFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                    ) : (
                        <div>
                            <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: '#A4A9B6' }} />
                            <p className="text-sm font-medium" style={{ color: '#717684' }}>Click to select a CSV file</p>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-3 rounded-lg flex items-start gap-2 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                    <AlertCircle className="w-4 h-4 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Preview totals */}
            {parsedRows.length > 0 && !result && (
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#A4A9B6' }}>
                        2. Preview
                    </h4>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="rounded-xl p-4" style={{ background: '#F6F6F9' }}>
                            <div className="flex items-center gap-2 mb-1">
                                <Users className="w-4 h-4" style={{ color: '#4141A2' }} />
                                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#717684' }}>People</p>
                            </div>
                            <p className="text-2xl font-bold tabular-nums" style={{ color: '#3F4450' }}>{totals.people}</p>
                        </div>
                        <div className="rounded-xl p-4" style={{ background: '#F6F6F9' }}>
                            <div className="flex items-center gap-2 mb-1">
                                <DollarSign className="w-4 h-4" style={{ color: '#21944E' }} />
                                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#717684' }}>Total $ (Salary + SBC)</p>
                            </div>
                            <p className="text-2xl font-bold tabular-nums" style={{ color: '#3F4450' }}>{fmtUSD(totals.dollars)}</p>
                        </div>
                    </div>

                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9', maxHeight: 220, overflowY: 'auto' }}>
                        <table className="w-full text-xs">
                            <thead style={{ position: 'sticky', top: 0, background: '#F6F6F9' }}>
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>NAME</th>
                                    <th className="px-3 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>EMAIL</th>
                                    <th className="px-3 py-2 text-right font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>GROSS</th>
                                    <th className="px-3 py-2 text-right font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>SBC</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsedRows.slice(0, 50).map((r, i) => (
                                    <tr key={i} style={{ borderTop: '1px solid #E2E4E9' }}>
                                        <td className="px-3 py-1.5" style={{ color: '#3F4450' }}>{r.name || '—'}</td>
                                        <td className="px-3 py-1.5" style={{ color: '#717684' }}>{r.email}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: '#3F4450' }}>{fmtUSD(parseFloat(r.grossSalary || '0') || 0)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: '#717684' }}>{fmtUSD(parseFloat(r.sbcAmount || '0') || 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {parsedRows.length > 50 && (
                        <p className="text-[11px] mt-1" style={{ color: '#A4A9B6' }}>
                            Showing first 50 of {parsedRows.length} rows.
                        </p>
                    )}
                </div>
            )}

            {/* Unmatched developer review */}
            {unmatched && unmatched.length > 0 && !result && (
                <div className="rounded-xl p-4" style={{ background: '#FFF8E6', border: '1px solid #F5E6A3' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#8B7020' }}>
                        {unmatched.length} new developer{unmatched.length > 1 ? 's' : ''} found that aren&apos;t on the roster.
                    </p>
                    <div className="rounded-lg border bg-white overflow-hidden mb-3" style={{ borderColor: '#E2E4E9', maxHeight: 180, overflowY: 'auto' }}>
                        {unmatched.map(d => (
                            <label key={d.email} className="flex items-center gap-2 px-3 py-2 cursor-pointer text-xs"
                                style={{ borderTop: '1px solid #F0F1F3' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedUnmatched.has(d.email)}
                                    onChange={() => setSelectedUnmatched(prev => {
                                        const n = new Set(prev);
                                        if (n.has(d.email)) n.delete(d.email); else n.add(d.email);
                                        return n;
                                    })}
                                />
                                <span style={{ color: '#3F4450' }}>{d.name || '—'}</span>
                                <span style={{ color: '#A4A9B6' }}>{d.email}</span>
                            </label>
                        ))}
                    </div>
                    <p className="text-[11px]" style={{ color: '#717684' }}>
                        Selected developers will be created before the payroll is committed.
                    </p>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className="rounded-xl p-4 flex items-start gap-3" style={{
                    background: result.errors.length === 0 ? '#EBF5EF' : '#FFF5F5',
                    border: `1px solid ${result.errors.length === 0 ? 'rgba(33,148,78,0.2)' : 'rgba(250,67,56,0.2)'}`,
                }}>
                    {result.errors.length === 0
                        ? <Check className="w-5 h-5" style={{ color: '#21944E' }} />
                        : <AlertCircle className="w-5 h-5" style={{ color: '#FA4338' }} />
                    }
                    <div className="flex-1">
                        <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>
                            {result.imported} entries imported · {result.skipped} skipped
                        </p>
                        {result.errors.map((e, i) => (
                            <p key={i} className="text-xs mt-1" style={{ color: '#FA4338' }}>{e}</p>
                        ))}
                    </div>
                </div>
            )}

            {/* Action footer */}
            <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E4E9' }}>
                <p className="text-[11px]" style={{ color: '#A4A9B6' }}>
                    <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />
                    Imports into the existing payroll register.
                </p>
                <div className="flex items-center gap-2">
                    {!result && (
                        <button
                            onClick={async () => {
                                if (unmatched === null) {
                                    await checkUnmatched();
                                } else {
                                    await commit();
                                }
                            }}
                            disabled={!period || parsedRows.length === 0 || submitting}
                            className="btn-primary"
                            style={{ opacity: !period || parsedRows.length === 0 || submitting ? 0.5 : 1 }}
                        >
                            {submitting
                                ? 'Importing…'
                                : unmatched === null
                                    ? 'Review & Import'
                                    : unmatched.length > 0
                                        ? `Add ${selectedUnmatched.size} & Import`
                                        : 'Import'}
                        </button>
                    )}
                    {result && result.errors.length === 0 && (
                        <button
                            onClick={() => goTo('jira')}
                            className="btn-primary"
                        >
                            Continue to Jira <ArrowRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
