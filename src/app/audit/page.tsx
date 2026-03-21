'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    ShieldAlert, Package, MessageSquare, AlertTriangle, ShieldCheck,
    ChevronDown, Download, Copy, Check, ExternalLink, RefreshCw,
    TrendingUp, DollarSign, FileText, X,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Period {
    id: string;
    month: number;
    year: number;
    status: string;
    totalCapitalized: number;
    totalExpensed: number;
    totalAmortization: number;
    grandTotal: number;
}

interface PackEntry {
    id: string;
    entryType: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    description: string;
    project: { id: string; name: string; status: string; isCapitalizable: boolean; mgmtAuthorized: boolean; probableToComplete: boolean };
    rationale: string;
    developerSummary: { name: string; tickets: number; points: number; amount: number }[];
    auditTrailCount: number;
    ticketIds: string[];
}

interface CommentaryItem {
    entryId: string;
    entryType: string;
    projectName: string;
    amount: number;
    commentary: string;
}

interface Anomaly {
    id: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    type: string;
    title: string;
    description: string;
    affectedPeriod?: string;
    affectedProject?: string;
    affectedAmount?: number;
    action: string;
}

interface AsuAssessment {
    projectId: string;
    projectName: string;
    projectStatus: string;
    epicKey: string;
    mgmtAuthorized: boolean;
    probableToComplete: boolean;
    criteriamet: number;
    totalCapitalized: number;
    atRisk: number;
    complianceStatus: 'COMPLIANT' | 'PARTIAL' | 'AT_RISK';
    recommendation: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

function entryBadge(type: string) {
    const styles: Record<string, { bg: string; color: string }> = {
        CAPITALIZATION: { bg: '#EBF5EF', color: '#21944E' },
        EXPENSE: { bg: '#FFF5F5', color: '#FA4338' },
        AMORTIZATION: { bg: '#EEF2FF', color: '#4141A2' },
    };
    return styles[type] || { bg: '#F6F6F9', color: '#717684' };
}

function severityBadge(s: 'HIGH' | 'MEDIUM' | 'LOW') {
    if (s === 'HIGH') return { bg: '#FFF5F5', color: '#FA4338', dot: '#FA4338' };
    if (s === 'MEDIUM') return { bg: '#FFFBEB', color: '#D3A236', dot: '#D3A236' };
    return { bg: '#F6F6F9', color: '#717684', dot: '#A4A9B6' };
}

function complianceBadge(s: 'COMPLIANT' | 'PARTIAL' | 'AT_RISK') {
    if (s === 'COMPLIANT') return { bg: '#EBF5EF', color: '#21944E', label: 'Compliant' };
    if (s === 'PARTIAL') return { bg: '#FFFBEB', color: '#D3A236', label: 'Partial' };
    return { bg: '#FFF5F5', color: '#FA4338', label: 'At Risk' };
}

// ─── CSV Download ──────────────────────────────────────────────────────────

function downloadPackCsv(period: Period | null, entries: PackEntry[]) {
    if (!period) return;
    const rows = [
        ['Entry Type', 'Project', 'Project Status', 'Debit Account', 'Credit Account', 'Amount', 'Tickets', 'Developers', 'Mgmt Auth', 'Probable to Complete', 'Rationale'],
        ...entries.map((e) => [
            e.entryType, e.project.name, e.project.status,
            e.debitAccount, e.creditAccount, e.amount.toFixed(2),
            e.auditTrailCount, e.developerSummary.length,
            e.project.mgmtAuthorized ? 'Yes' : 'No',
            e.project.probableToComplete ? 'Yes' : 'No',
            `"${e.rationale.replace(/"/g, '""')}"`,
        ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-pack-${MONTH_NAMES[period.month - 1]}-${period.year}.csv`;
    a.click();
}

// ─── Sub-components ────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button onClick={copy} className="btn-ghost" style={{ padding: '4px 8px' }}>
            {copied ? <Check className="w-3.5 h-3.5" style={{ color: '#21944E' }} /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
}

// ─── Tab: Audit Pack ───────────────────────────────────────────────────────

function AuditPackTab({ periods }: { periods: { month: number; year: number; status: string }[] }) {
    const now = new Date();
    const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
    const [selYear, setSelYear] = useState(now.getFullYear());
    const [packData, setPackData] = useState<{ period: Period; summary: { entryCount: number; totalTickets: number; totalDevelopers: number; capitalizationRate: number }; entries: PackEntry[] } | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/audit/pack?month=${selMonth}&year=${selYear}`);
            if (!res.ok) { setPackData(null); return; }
            setPackData(await res.json());
        } finally {
            setLoading(false);
        }
    }, [selMonth, selYear]);

    useEffect(() => { load(); }, [load]);

    return (
        <div>
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <label className="form-label mb-0">Month</label>
                    <select value={selMonth} onChange={(e) => setSelMonth(+e.target.value)} className="form-select" style={{ width: 120 }}>
                        {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="form-label mb-0">Year</label>
                    <select value={selYear} onChange={(e) => setSelYear(+e.target.value)} className="form-select" style={{ width: 100 }}>
                        {[2023, 2024, 2025, 2026].map((y) => <option key={y}>{y}</option>)}
                    </select>
                </div>
                <button onClick={load} className="btn-ghost"><RefreshCw className="w-4 h-4" /> Refresh</button>
                {packData && (
                    <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
                        <button
                            onClick={() => window.open(`/api/audit/export?month=${selMonth}&year=${selYear}`, '_blank')}
                            className="btn-ghost"
                            title="Download comprehensive export with payroll, tickets, projects, and amortization data"
                        >
                            <FileText className="w-4 h-4" /> Master Export
                        </button>
                        <button onClick={() => downloadPackCsv(packData.period, packData.entries)} className="btn-primary">
                            <Download className="w-4 h-4" /> Audit Pack CSV
                        </button>
                    </div>
                )}
            </div>

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
                </div>
            )}

            {!loading && !packData && (
                <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
                    <Package className="w-10 h-10 mb-3" style={{ color: '#D3D5DB' }} />
                    <p className="text-sm font-medium" style={{ color: '#717684' }}>No period found for {MONTH_NAMES[selMonth - 1]} {selYear}</p>
                    <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>Generate journal entries on the Accounting page first.</p>
                </div>
            )}

            {!loading && packData && (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        {[
                            { label: 'Total Capitalized', val: fmt(packData.period.totalCapitalized), color: '#21944E' },
                            { label: 'Total Expensed', val: fmt(packData.period.totalExpensed), color: '#FA4338' },
                            { label: 'Total Amortization', val: fmt(packData.period.totalAmortization), color: '#4141A2' },
                            { label: 'Cap Rate', val: `${Math.round(packData.summary.capitalizationRate * 100)}%`, color: '#3F4450' },
                        ].map((c) => (
                            <div key={c.label} className="glass-card p-4">
                                <p className="text-xs mb-1" style={{ color: '#A4A9B6' }}>{c.label}</p>
                                <p className="text-xl font-bold" style={{ color: c.color }}>{c.val}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: '#A4A9B6' }}>
                        <span>{packData.summary.entryCount} entries</span>
                        <span>·</span>
                        <span>{packData.summary.totalTickets} tickets</span>
                        <span>·</span>
                        <span>{packData.summary.totalDevelopers} developers</span>
                        <span>·</span>
                        <span className="font-semibold" style={{ color: packData.period.status === 'CLOSED' ? '#FA4338' : '#21944E' }}>Period {packData.period.status}</span>
                    </div>

                    {/* Entries table */}
                    <div className="glass-card overflow-hidden">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Project</th>
                                    <th>Debit</th>
                                    <th>Credit</th>
                                    <th className="text-right">Amount</th>
                                    <th>Tickets</th>
                                    <th>ASU</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {packData.entries.map((entry) => {
                                    const badge = entryBadge(entry.entryType);
                                    const isExp = expandedEntry === entry.id;
                                    const asuOk = entry.project.mgmtAuthorized && entry.project.probableToComplete;
                                    return (
                                        <>
                                            <tr key={entry.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedEntry(isExp ? null : entry.id)}>
                                                <td><span className="badge text-xs" style={{ background: badge.bg, color: badge.color }}>{entry.entryType}</span></td>
                                                <td>
                                                    <div>
                                                        <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{entry.project.name}</p>
                                                        <p className="text-xs" style={{ color: '#A4A9B6' }}>{entry.project.status}</p>
                                                    </div>
                                                </td>
                                                <td><span className="text-xs" style={{ color: '#717684' }}>{entry.debitAccount}</span></td>
                                                <td><span className="text-xs" style={{ color: '#717684' }}>{entry.creditAccount}</span></td>
                                                <td className="text-right"><span className="text-sm font-bold" style={{ color: '#3F4450' }}>{fmt(entry.amount)}</span></td>
                                                <td><span className="badge text-xs" style={{ background: '#F6F6F9', color: '#717684' }}>{entry.auditTrailCount}</span></td>
                                                <td>
                                                    <span className="text-base" title={asuOk ? 'ASU-compliant' : 'Missing ASU criteria'}>
                                                        {asuOk ? '✅' : '⚠️'}
                                                    </span>
                                                </td>
                                                <td><ChevronDown className="w-4 h-4" style={{ color: '#A4A9B6', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} /></td>
                                            </tr>
                                            {isExp && (
                                                <tr key={`${entry.id}-exp`} style={{ background: '#F9FAFB' }}>
                                                    <td colSpan={8} style={{ padding: '12px 20px' }}>
                                                        <div className="space-y-3">
                                                            <div className="rounded-lg p-3" style={{ background: '#EEF2FF', border: '1px solid rgba(65,65,162,0.15)' }}>
                                                                <p className="text-xs font-semibold mb-1" style={{ color: '#4141A2' }}>Classification Rationale</p>
                                                                <p className="text-xs" style={{ color: '#717684' }}>{entry.rationale}</p>
                                                            </div>
                                                            {entry.developerSummary.length > 0 && (
                                                                <div>
                                                                    <p className="text-xs font-semibold mb-2" style={{ color: '#3F4450' }}>Developer Breakdown</p>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {entry.developerSummary.map((d) => (
                                                                            <div key={d.name} className="text-xs rounded-lg px-3 py-1.5" style={{ background: '#FFFFFF', border: '1px solid #E2E4E9' }}>
                                                                                <span className="font-medium" style={{ color: '#3F4450' }}>{d.name}</span>
                                                                                <span style={{ color: '#A4A9B6' }}> · {d.tickets} tickets · {d.points} pts · {fmt(d.amount)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {entry.ticketIds.length > 0 && (
                                                                <div>
                                                                    <p className="text-xs font-semibold mb-1.5" style={{ color: '#3F4450' }}>Supporting Tickets</p>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {entry.ticketIds.slice(0, 20).map((tid) => (
                                                                            <span key={tid} className="badge text-[10px] font-mono" style={{ background: '#F6F6F9', color: '#717684' }}>{tid}</span>
                                                                        ))}
                                                                        {entry.ticketIds.length > 20 && (
                                                                            <span className="badge text-[10px]" style={{ background: '#F6F6F9', color: '#A4A9B6' }}>+{entry.ticketIds.length - 20} more</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Tab: Commentary ───────────────────────────────────────────────────────

function CommentaryTab() {
    const now = new Date();
    const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
    const [selYear, setSelYear] = useState(now.getFullYear());
    const [items, setItems] = useState<CommentaryItem[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/audit/commentary?month=${selMonth}&year=${selYear}`);
            if (!res.ok) { setItems([]); return; }
            const data = await res.json();
            setItems(data.commentary || []);
        } finally { setLoading(false); }
    }, [selMonth, selYear]);

    useEffect(() => { load(); }, [load]);

    return (
        <div>
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <label className="form-label mb-0">Month</label>
                    <select value={selMonth} onChange={(e) => setSelMonth(+e.target.value)} className="form-select" style={{ width: 120 }}>
                        {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="form-label mb-0">Year</label>
                    <select value={selYear} onChange={(e) => setSelYear(+e.target.value)} className="form-select" style={{ width: 100 }}>
                        {[2023, 2024, 2025, 2026].map((y) => <option key={y}>{y}</option>)}
                    </select>
                </div>
                <button onClick={load} className="btn-ghost"><RefreshCw className="w-4 h-4" /> Refresh</button>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
                </div>
            )}

            {!loading && items.length === 0 && (
                <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
                    <MessageSquare className="w-10 h-10 mb-3" style={{ color: '#D3D5DB' }} />
                    <p className="text-sm font-medium" style={{ color: '#717684' }}>No entries found for {MONTH_NAMES[selMonth - 1]} {selYear}</p>
                </div>
            )}

            <div className="space-y-4">
                {items.map((item) => {
                    const badge = entryBadge(item.entryType);
                    return (
                        <div key={item.entryId} className="glass-card p-5">
                            <div className="flex items-start justify-between gap-4 mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="badge" style={{ background: badge.bg, color: badge.color }}>{item.entryType}</span>
                                    <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>{item.projectName}</span>
                                    <span className="text-sm font-bold" style={{ color: badge.color }}>{fmt(item.amount)}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <CopyButton text={item.commentary} />
                                    <span className="text-xs" style={{ color: '#A4A9B6' }}>Copy</span>
                                </div>
                            </div>
                            <p className="text-sm leading-relaxed" style={{ color: '#3F4450' }}>{item.commentary}</p>
                        </div>
                    );
                })}
            </div>

            {items.length > 0 && (
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={() => navigator.clipboard.writeText(items.map((i) => i.commentary).join('\n\n'))}
                        className="btn-ghost text-xs"
                    >
                        <Copy className="w-3.5 h-3.5" /> Copy All Commentary
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Tab: Anomalies ────────────────────────────────────────────────────────

function AnomaliesTab() {
    const [data, setData] = useState<{ count: number; anomalies: Anomaly[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetch('/api/audit/anomalies')
            .then((r) => r.json())
            .then(setData)
            .finally(() => setLoading(false));
    }, []);

    const visible = data?.anomalies.filter((a) => !dismissed.has(a.id)) ?? [];

    return (
        <div>
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
                </div>
            )}

            {!loading && visible.length === 0 && (
                <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
                    <ShieldCheck className="w-10 h-10 mb-3" style={{ color: '#21944E' }} />
                    <p className="text-sm font-semibold" style={{ color: '#21944E' }}>No anomalies detected</p>
                    <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>All periods and projects look healthy.</p>
                </div>
            )}

            {!loading && data && visible.length > 0 && (
                <>
                    <div className="flex items-center gap-4 mb-4 text-xs" style={{ color: '#A4A9B6' }}>
                        <span>{visible.length} anomal{visible.length === 1 ? 'y' : 'ies'} detected</span>
                        <span>·</span>
                        <span style={{ color: '#FA4338' }}>{visible.filter((a) => a.severity === 'HIGH').length} high</span>
                        <span>·</span>
                        <span style={{ color: '#D3A236' }}>{visible.filter((a) => a.severity === 'MEDIUM').length} medium</span>
                    </div>

                    <div className="space-y-3">
                        {visible.map((anomaly) => {
                            const badge = severityBadge(anomaly.severity);
                            return (
                                <div key={anomaly.id} className="glass-card p-5" style={{ borderLeft: `3px solid ${badge.dot}` }}>
                                    <div className="flex items-start gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: badge.dot }} />
                                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: 4 }}>
                                                    {anomaly.severity}
                                                </span>
                                                <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>{anomaly.title}</span>
                                            </div>

                                            <p className="text-sm mb-3" style={{ color: '#717684' }}>{anomaly.description}</p>

                                            <div className="flex flex-wrap gap-3 text-xs" style={{ color: '#A4A9B6' }}>
                                                {anomaly.affectedPeriod && (
                                                    <span>Period: <strong style={{ color: '#3F4450' }}>{anomaly.affectedPeriod}</strong></span>
                                                )}
                                                {anomaly.affectedProject && (
                                                    <span>Project: <strong style={{ color: '#3F4450' }}>{anomaly.affectedProject}</strong></span>
                                                )}
                                                {anomaly.affectedAmount !== undefined && (
                                                    <span>Amount: <strong style={{ color: '#3F4450' }}>{fmt(anomaly.affectedAmount)}</strong></span>
                                                )}
                                            </div>

                                            <div className="mt-3 rounded-lg p-3" style={{ background: '#F6F6F9' }}>
                                                <p className="text-xs font-semibold mb-0.5" style={{ color: '#3F4450' }}>Recommended Action</p>
                                                <p className="text-xs" style={{ color: '#717684' }}>{anomaly.action}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-1 flex-shrink-0">
                                            {anomaly.affectedProject && (
                                                <Link href="/projects" className="btn-ghost text-xs">
                                                    <ExternalLink className="w-3 h-3" /> Projects
                                                </Link>
                                            )}
                                            {anomaly.affectedPeriod && (
                                                <Link href="/accounting" className="btn-ghost text-xs">
                                                    <ExternalLink className="w-3 h-3" /> Accounting
                                                </Link>
                                            )}
                                            <button
                                                onClick={() => setDismissed((prev) => new Set(Array.from(prev).concat(anomaly.id)))}
                                                className="btn-ghost text-xs"
                                                style={{ color: '#A4A9B6' }}
                                            >
                                                <X className="w-3 h-3" /> Dismiss
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Tab: ASU 2025-06 Report ───────────────────────────────────────────────

function AsuReportTab() {
    const [data, setData] = useState<{
        summary: { totalCapitalizedProjects: number; fullyCompliant: number; partiallyCompliant: number; nonCompliant: number; totalAtRisk: number; complianceScore: number; standardEffectiveDate: string; guidance: string };
        assessments: AsuAssessment[];
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/audit/asu-report')
            .then((r) => r.json())
            .then(setData)
            .finally(() => setLoading(false));
    }, []);

    return (
        <div>
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
                </div>
            )}

            {!loading && data && (
                <>
                    {/* Score + summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        {/* Compliance score */}
                        <div className="glass-card p-5 flex flex-col items-center justify-center md:col-span-1">
                            <div
                                className="w-24 h-24 rounded-full flex flex-col items-center justify-center mb-3"
                                style={{
                                    background: `conic-gradient(${data.summary.complianceScore >= 80 ? '#21944E' : data.summary.complianceScore >= 50 ? '#D3A236' : '#FA4338'} ${data.summary.complianceScore * 3.6}deg, #E2E4E9 0deg)`,
                                }}
                            >
                                <div className="w-16 h-16 rounded-full bg-white flex flex-col items-center justify-center">
                                    <span className="text-xl font-bold" style={{ color: '#3F4450' }}>{data.summary.complianceScore}</span>
                                    <span className="text-[10px]" style={{ color: '#A4A9B6' }}>/ 100</span>
                                </div>
                            </div>
                            <p className="text-xs font-semibold text-center" style={{ color: '#717684' }}>ASU 2025-06 Score</p>
                        </div>

                        <div className="glass-card p-5 md:col-span-3">
                            <p className="text-xs font-semibold mb-1" style={{ color: '#717684' }}>Standard effective {data.summary.standardEffectiveDate}</p>
                            <p className="text-sm mb-4" style={{ color: '#3F4450' }}>{data.summary.guidance}</p>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="text-center rounded-xl p-3" style={{ background: '#EBF5EF' }}>
                                    <p className="text-xl font-bold" style={{ color: '#21944E' }}>{data.summary.fullyCompliant}</p>
                                    <p className="text-[10px] font-semibold" style={{ color: '#21944E' }}>COMPLIANT</p>
                                </div>
                                <div className="text-center rounded-xl p-3" style={{ background: '#FFFBEB' }}>
                                    <p className="text-xl font-bold" style={{ color: '#D3A236' }}>{data.summary.partiallyCompliant}</p>
                                    <p className="text-[10px] font-semibold" style={{ color: '#D3A236' }}>PARTIAL</p>
                                </div>
                                <div className="text-center rounded-xl p-3" style={{ background: '#FFF5F5' }}>
                                    <p className="text-xl font-bold" style={{ color: '#FA4338' }}>{data.summary.nonCompliant}</p>
                                    <p className="text-[10px] font-semibold" style={{ color: '#FA4338' }}>AT RISK</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* At-risk banner */}
                    {data.summary.totalAtRisk > 0 && (
                        <div className="rounded-xl p-4 mb-6" style={{ background: '#FFF5F5', border: '1px solid rgba(250,67,56,0.2)' }}>
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#FA4338' }} />
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: '#FA4338' }}>{fmt(data.summary.totalAtRisk)} in capitalized costs at risk of restatement</p>
                                    <p className="text-xs mt-0.5" style={{ color: '#717684' }}>Under ASU 2025-06, these costs must be expensed unless both management authorization and probable-to-complete criteria are documented.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Project table */}
                    <div className="glass-card overflow-hidden">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Project</th>
                                    <th>Status</th>
                                    <th>Mgmt Auth</th>
                                    <th>Probable</th>
                                    <th className="text-right">Capitalized</th>
                                    <th className="text-right">At Risk</th>
                                    <th>Compliance</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.assessments.map((a) => {
                                    const badge = complianceBadge(a.complianceStatus);
                                    return (
                                        <tr key={a.projectId}>
                                            <td>
                                                <div>
                                                    <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{a.projectName}</p>
                                                    <p className="text-[10px] font-mono" style={{ color: '#A4A9B6' }}>{a.epicKey}</p>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge text-xs" style={{ background: '#F6F6F9', color: '#717684' }}>{a.projectStatus}</span>
                                            </td>
                                            <td>
                                                <span className="text-base">{a.mgmtAuthorized ? '✅' : '❌'}</span>
                                            </td>
                                            <td>
                                                <span className="text-base">{a.probableToComplete ? '✅' : '❌'}</span>
                                            </td>
                                            <td className="text-right">
                                                <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>{fmt(a.totalCapitalized)}</span>
                                            </td>
                                            <td className="text-right">
                                                <span className="text-sm font-semibold" style={{ color: a.atRisk > 0 ? '#FA4338' : '#21944E' }}>
                                                    {a.atRisk > 0 ? fmt(a.atRisk) : '—'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                                            </td>
                                            <td>
                                                <Link href={`/projects/${a.projectId}`} className="btn-ghost text-xs">
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Recommendations */}
                    {data.assessments.filter((a) => a.complianceStatus !== 'COMPLIANT').length > 0 && (
                        <div className="mt-6 space-y-3">
                            <h3 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Recommended Actions</h3>
                            {data.assessments
                                .filter((a) => a.complianceStatus !== 'COMPLIANT')
                                .map((a) => {
                                    const badge = complianceBadge(a.complianceStatus);
                                    return (
                                        <div key={a.projectId} className="rounded-xl p-4 flex items-start gap-3" style={{ background: '#F6F6F9', border: '1px solid #E2E4E9' }}>
                                            <span className="badge flex-shrink-0" style={{ background: badge.bg, color: badge.color }}>{a.projectName}</span>
                                            <p className="text-xs" style={{ color: '#717684' }}>{a.recommendation}</p>
                                            <Link href={`/projects/${a.projectId}`} className="btn-ghost text-xs flex-shrink-0">Fix →</Link>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const TABS = [
    { id: 'pack', label: 'Audit Pack', icon: Package },
    { id: 'commentary', label: 'AI Commentary', icon: MessageSquare },
    { id: 'anomalies', label: 'Anomalies', icon: AlertTriangle },
    { id: 'asu', label: 'ASU 2025-06 Report', icon: ShieldCheck },
];

export default function AuditPage() {
    const [activeTab, setActiveTab] = useState('pack');
    const [periods, setPeriods] = useState<{ month: number; year: number; status: string }[]>([]);
    const [anomalyCount, setAnomalyCount] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/accounting').then((r) => r.json()).then(setPeriods).catch(() => {});
        fetch('/api/audit/anomalies')
            .then((r) => r.json())
            .then((d) => setAnomalyCount(d.count ?? 0))
            .catch(() => {});
    }, []);

    return (
        <div>
            <div className="mb-4">
                <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ChevronDown className="w-3.5 h-3.5 rotate-90" /> Back to Admin Portal
                </Link>
            </div>
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <ShieldAlert className="w-6 h-6" style={{ color: '#4141A2' }} />
                    <h1 className="section-header" style={{ marginBottom: 0 }}>Audit Intelligence</h1>
                </div>
                <p className="section-subtext">Audit-ready analysis, anomaly detection, and ASU 2025-06 compliance reporting</p>
            </div>

            {/* Quick-stat strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                        <FileText className="w-4 h-4" style={{ color: '#4141A2' }} />
                    </div>
                    <div>
                        <p className="text-lg font-bold" style={{ color: '#3F4450' }}>{periods.length}</p>
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>Periods</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#FFF5F5' }}>
                        <AlertTriangle className="w-4 h-4" style={{ color: '#FA4338' }} />
                    </div>
                    <div>
                        <p className="text-lg font-bold" style={{ color: anomalyCount && anomalyCount > 0 ? '#FA4338' : '#21944E' }}>
                            {anomalyCount ?? '—'}
                        </p>
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>Anomalies</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#EBF5EF' }}>
                        <TrendingUp className="w-4 h-4" style={{ color: '#21944E' }} />
                    </div>
                    <div>
                        <p className="text-lg font-bold" style={{ color: '#3F4450' }}>
                            {periods.filter((p) => p.status === 'CLOSED').length}
                        </p>
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>Closed Periods</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#F5F3FF' }}>
                        <DollarSign className="w-4 h-4" style={{ color: '#4141A2' }} />
                    </div>
                    <div>
                        <p className="text-lg font-bold" style={{ color: '#3F4450' }}>Live</p>
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>Compliance Status</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: '#F6F6F9', width: 'fit-content' }}>
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                            style={{
                                background: isActive ? '#FFFFFF' : 'transparent',
                                color: isActive ? '#3F4450' : '#A4A9B6',
                                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            }}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {tab.id === 'anomalies' && anomalyCount !== null && anomalyCount > 0 && (
                                <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: '#FA4338', color: '#FFFFFF' }}>
                                    {anomalyCount > 9 ? '9+' : anomalyCount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            {activeTab === 'pack' && <AuditPackTab periods={periods} />}
            {activeTab === 'commentary' && <CommentaryTab />}
            {activeTab === 'anomalies' && <AnomaliesTab />}
            {activeTab === 'asu' && <AsuReportTab />}
        </div>
    );
}
