'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePeriod } from '@/context/PeriodContext';
import {
    Package, ArrowLeft, Download, FileText, Users, DollarSign,
    CheckCircle2, AlertTriangle, Shield, ChevronDown, ChevronUp,
    Printer, BarChart2, X, GitBranch,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────── */
interface DevSummary { name: string; tickets: number; points: number; amount: number; }

interface PackEntry {
    id: string;
    entryType: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    description: string | null;
    project: {
        id: string;
        name: string;
        status: string;
        isCapitalizable: boolean;
        mgmtAuthorized: boolean;
        probableToComplete: boolean;
    };
    rationale: string;
    developerSummary: DevSummary[];
    auditTrailCount: number;
    ticketIds: string[];
}

interface PackData {
    period: {
        id: string;
        month: number;
        year: number;
        status: string;
        totalCapitalized: number;
        totalExpensed: number;
        totalAmortization: number;
        grandTotal: number;
    };
    summary: {
        entryCount: number;
        totalTickets: number;
        totalDevelopers: number;
        capitalizationRate: number;
    };
    entries: PackEntry[];
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const monthName = (m: number) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];

/* ─── Component ─────────────────────────────────────────────────── */
export default function AuditPackagePage() {
    const { range } = usePeriod();
    const [data, setData] = useState<PackData | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
    const [violationModal, setViolationModal] = useState<'mgmtAuthorized' | 'probableToComplete' | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    // Determine month/year from the period context
    const month = range.end.getMonth() + 1;
    const year = range.end.getFullYear();

    const loadData = useCallback(() => {
        setLoading(true);
        fetch(`/api/audit/pack?month=${month}&year=${year}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) { setData(null); setLoading(false); return; }
                setData(d);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [month, year]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleExportCSV = () => {
        if (!data) return;
        const rows: string[][] = [
            ['Entry Type', 'Project', 'Debit Account', 'Credit Account', 'Amount', 'Rationale', 'Developers', 'Ticket Count'],
        ];
        for (const e of data.entries) {
            rows.push([
                e.entryType,
                e.project.name,
                e.debitAccount,
                e.creditAccount,
                e.amount.toFixed(2),
                `"${e.rationale.replace(/"/g, '""')}"`,
                e.developerSummary.map(d => d.name).join('; '),
                e.auditTrailCount.toString(),
            ]);
        }
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-package-${monthName(month)}-${year}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <AlertTriangle className="w-10 h-10" style={{ color: 'var(--amber)' }} />
                <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>No accounting period found for {monthName(month)} {year}</p>
                <p className="text-xs" style={{ color: '#A4A9B6' }}>Make sure journal entries have been generated for this period.</p>
                <Link href="/accounting/journal-entries" className="btn-accent text-sm mt-2">
                    Go to Journal Entries
                </Link>
            </div>
        );
    }

    const { period: p, summary: s, entries } = data;

    const capEntries = entries.filter(e => e.entryType === 'CAPITALIZATION');
    const expEntries = entries.filter(e => e.entryType === 'EXPENSE');
    const amortEntries = entries.filter(e => e.entryType === 'AMORTIZATION');

    // Completeness score
    const checks: { label: string; pass: boolean; actionKey?: 'mgmtAuthorized' | 'probableToComplete' }[] = [
        { label: 'Journal entries generated', pass: entries.length > 0 },
        { label: 'Ticket evidence linked', pass: s.totalTickets > 0 },
        { label: 'Developer attribution present', pass: s.totalDevelopers > 0 },
        { label: 'Classification rationale documented', pass: entries.every(e => e.rationale.length > 10) },
        { label: 'Management authorization (all projects)', pass: capEntries.every(e => e.project.mgmtAuthorized), actionKey: 'mgmtAuthorized' },
        { label: 'Probable to complete (all projects)', pass: capEntries.every(e => e.project.probableToComplete), actionKey: 'probableToComplete' },
    ];
    const passCount = checks.filter(c => c.pass).length;
    const auditScore = Math.round((passCount / checks.length) * 100);

    return (
        <div ref={printRef}>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <Link href="/accounting" className="flex items-center gap-1 text-xs font-semibold mb-2 no-underline" style={{ color: 'var(--gem)' }}>
                        <ArrowLeft className="w-3 h-3" /> Accounting Hub
                    </Link>
                    <h1 className="section-header flex items-center gap-2">
                        <Package className="w-5 h-5" style={{ color: 'var(--gem)' }} />
                        Audit Package — {monthName(p.month)} {p.year}
                    </h1>
                    <p className="section-subtext">Auditor-ready evidence bundle: journal entries, ticket attribution, and compliance documentation</p>
                </div>
                <div className="flex items-center gap-3 print:hidden">
                    <Link href="/audit-package/logic-flow" className="btn-secondary flex items-center gap-2 text-sm" style={{ textDecoration: 'none' }}>
                        <GitBranch className="w-4 h-4" /> Logic Flow
                    </Link>
                    <button onClick={handlePrint} className="btn-secondary flex items-center gap-2 text-sm">
                        <Printer className="w-4 h-4" /> Print
                    </button>
                    <button onClick={handleExportCSV} className="btn-accent flex items-center gap-2 text-sm">
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>
            </div>

            {/* ── KPI Row ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <StatCard icon={<DollarSign className="w-4 h-4" />} label="Capitalized" value={fmt(p.totalCapitalized)} color="var(--gem)" />
                <StatCard icon={<DollarSign className="w-4 h-4" />} label="Expensed" value={fmt(p.totalExpensed)} color="var(--envoy-red)" />
                <StatCard icon={<BarChart2 className="w-4 h-4" />} label="Amortization" value={fmt(p.totalAmortization)} color="var(--amber)" />
                <StatCard icon={<FileText className="w-4 h-4" />} label="Journal Entries" value={s.entryCount.toString()} color="var(--gem)" />
                <StatCard icon={<Users className="w-4 h-4" />} label="Developers" value={s.totalDevelopers.toString()} color="var(--slate)" />
                <StatCard icon={<Shield className="w-4 h-4" />} label="Audit Score" value={`${auditScore}%`} color={auditScore >= 80 ? 'var(--cilantro)' : auditScore >= 50 ? 'var(--amber)' : 'var(--envoy-red)'} />
            </div>

            {/* ── Compliance Checklist ── */}
            <div className="glass-card p-6 mb-6">
                <p className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>ASC 350-40 Compliance Checklist</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {checks.map((check, i) => {
                        const isClickable = !check.pass && !!check.actionKey;
                        return (
                            <div
                                key={i}
                                className="flex items-center gap-3 rounded-xl px-4 py-3 border transition-all"
                                onClick={isClickable ? () => setViolationModal(check.actionKey!) : undefined}
                                style={{
                                    borderColor: check.pass ? '#D1F0DB' : '#FFDDD9',
                                    background: check.pass ? '#F0FAF3' : '#FFF8F7',
                                    cursor: isClickable ? 'pointer' : 'default',
                                }}
                                onMouseEnter={(e) => { if (isClickable) e.currentTarget.style.boxShadow = '0 2px 8px rgba(250,67,56,0.15)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                {check.pass ? (
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#21944E' }} />
                                ) : (
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--envoy-red)' }} />
                                )}
                                <span className="text-xs font-medium" style={{ color: check.pass ? '#21944E' : '#3F4450' }}>
                                    {check.label}
                                </span>
                                {isClickable && (
                                    <span className="ml-auto text-[10px] font-semibold" style={{ color: 'var(--envoy-red)' }}>Fix →</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Violation Quick-Fix Modal ── */}
            {violationModal && (
                <ViolationModal
                    field={violationModal}
                    entries={capEntries}
                    onClose={() => { setViolationModal(null); loadData(); }}
                />
            )}

            {/* ── Period Summary ── */}
            <div className="glass-card p-6 mb-6">
                <p className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Period Summary</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '2px solid #E2E4E9' }}>
                                <th className="text-left py-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#717684' }}>Category</th>
                                <th className="text-right py-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#717684' }}>Amount</th>
                                <th className="text-right py-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#717684' }}>% of Total</th>
                                <th className="text-right py-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#717684' }}>Entries</th>
                                <th className="text-right py-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#717684' }}>Tickets</th>
                            </tr>
                        </thead>
                        <tbody>
                            <SummaryRow label="Capitalized (CAPEX)" amount={p.totalCapitalized} total={p.grandTotal} count={capEntries.length} tickets={capEntries.reduce((s, e) => s + e.auditTrailCount, 0)} color="var(--gem)" />
                            <SummaryRow label="Expensed (OPEX)" amount={p.totalExpensed} total={p.grandTotal} count={expEntries.length} tickets={expEntries.reduce((s, e) => s + e.auditTrailCount, 0)} color="var(--envoy-red)" />
                            <SummaryRow label="Amortization" amount={p.totalAmortization} total={p.grandTotal} count={amortEntries.length} tickets={amortEntries.reduce((s, e) => s + e.auditTrailCount, 0)} color="var(--amber)" />
                            <tr style={{ borderTop: '2px solid #E2E4E9' }}>
                                <td className="py-2.5 text-xs font-bold" style={{ color: '#3F4450' }}>Total</td>
                                <td className="py-2.5 text-right text-xs font-bold" style={{ color: '#3F4450' }}>{fmt(p.grandTotal)}</td>
                                <td className="py-2.5 text-right text-xs font-bold" style={{ color: '#3F4450' }}>100%</td>
                                <td className="py-2.5 text-right text-xs font-bold" style={{ color: '#3F4450' }}>{entries.length}</td>
                                <td className="py-2.5 text-right text-xs font-bold" style={{ color: '#3F4450' }}>{s.totalTickets}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="mt-3 text-right">
                    <span className="text-[11px] font-semibold" style={{ color: '#717684' }}>Capitalization Rate: </span>
                    <span className="text-sm font-bold" style={{ color: 'var(--gem)' }}>{pct(s.capitalizationRate)}</span>
                </div>
            </div>

            {/* ── Journal Entry Evidence ── */}
            <div className="glass-card p-6">
                <p className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Journal Entry Evidence Trail</p>
                <div className="space-y-3">
                    {entries.map(entry => {
                        const isExpanded = expandedEntry === entry.id;
                        const typeColor = entry.entryType === 'CAPITALIZATION' ? 'var(--gem)' : entry.entryType === 'EXPENSE' ? 'var(--envoy-red)' : 'var(--amber)';
                        const typeBg = entry.entryType === 'CAPITALIZATION' ? 'var(--tint-accent)' : entry.entryType === 'EXPENSE' ? 'var(--tint-error)' : 'var(--tint-warning)';

                        return (
                            <div key={entry.id} className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9' }}>
                                {/* Collapsed Row */}
                                <button
                                    onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                                    className="w-full flex items-center justify-between px-5 py-3.5 transition-colors text-left"
                                    style={{ background: isExpanded ? '#FAFBFC' : '#FFFFFF' }}
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="badge text-[10px]" style={{ background: typeBg, color: typeColor }}>
                                            {entry.entryType}
                                        </span>
                                        <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>{entry.project.name}</span>
                                        <span className="text-xs" style={{ color: '#A4A9B6' }}>
                                            DR {entry.debitAccount} / CR {entry.creditAccount}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-bold" style={{ color: typeColor }}>{fmt(entry.amount)}</span>
                                        <span className="text-[10px] font-semibold" style={{ color: '#A4A9B6' }}>
                                            {entry.auditTrailCount} tickets
                                        </span>
                                        {isExpanded ? <ChevronUp className="w-4 h-4" style={{ color: '#A4A9B6' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#A4A9B6' }} />}
                                    </div>
                                </button>

                                {/* Expanded Detail */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 border-t" style={{ borderColor: '#E2E4E9', background: '#FAFBFC' }}>
                                        {/* Rationale */}
                                        <div className="mt-4 mb-4 rounded-lg p-3.5 border" style={{ borderColor: '#D1D5E0', background: '#FFFFFF' }}>
                                            <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#717684' }}>Classification Rationale</p>
                                            <p className="text-xs leading-relaxed" style={{ color: '#3F4450' }}>{entry.rationale}</p>
                                        </div>

                                        {/* Project Compliance */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                            <CompliancePill label="Status" value={entry.project.status} />
                                            <CompliancePill label="Capitalizable" value={entry.project.isCapitalizable ? 'Yes' : 'No'} pass={entry.project.isCapitalizable} />
                                            <CompliancePill label="Mgmt Authorized" value={entry.project.mgmtAuthorized ? 'Yes' : 'No'} pass={entry.project.mgmtAuthorized} />
                                            <CompliancePill label="Probable to Complete" value={entry.project.probableToComplete ? 'Yes' : 'No'} pass={entry.project.probableToComplete} />
                                        </div>

                                        {/* Developer Summary */}
                                        {entry.developerSummary.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#717684' }}>Developer Attribution</p>
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid #E2E4E9' }}>
                                                            <th className="text-left py-1.5 font-semibold" style={{ color: '#717684' }}>Developer</th>
                                                            <th className="text-right py-1.5 font-semibold" style={{ color: '#717684' }}>Tickets</th>
                                                            <th className="text-right py-1.5 font-semibold" style={{ color: '#717684' }}>Points</th>
                                                            <th className="text-right py-1.5 font-semibold" style={{ color: '#717684' }}>Allocated</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {entry.developerSummary.map((d, i) => (
                                                            <tr key={i} style={{ borderBottom: '1px solid #F0F0F5' }}>
                                                                <td className="py-1.5 font-medium" style={{ color: '#3F4450' }}>{d.name}</td>
                                                                <td className="py-1.5 text-right" style={{ color: '#717684' }}>{d.tickets}</td>
                                                                <td className="py-1.5 text-right" style={{ color: '#717684' }}>{d.points}</td>
                                                                <td className="py-1.5 text-right font-semibold" style={{ color: 'var(--gem)' }}>{fmt(d.amount)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* Ticket IDs */}
                                        {entry.ticketIds.length > 0 && (
                                            <div className="mt-3">
                                                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#717684' }}>Supporting Tickets</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {entry.ticketIds.slice(0, 20).map(tid => (
                                                        <span key={tid} className="badge text-[9px]" style={{ background: 'var(--tint-info)', color: 'var(--slate)' }}>
                                                            {tid}
                                                        </span>
                                                    ))}
                                                    {entry.ticketIds.length > 20 && (
                                                        <span className="text-[10px] font-semibold" style={{ color: '#A4A9B6' }}>
                                                            +{entry.ticketIds.length - 20} more
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {entries.length === 0 && (
                        <div className="text-center py-12">
                            <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#C8CAD0' }} />
                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>No journal entries for this period</p>
                            <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>Generate journal entries first to build the audit package.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Violation Quick-Fix Modal ────────────────────────────────── */
function ViolationModal({
    field,
    entries,
    onClose,
}: {
    field: 'mgmtAuthorized' | 'probableToComplete';
    entries: PackEntry[];
    onClose: () => void;
}) {
    const label = field === 'mgmtAuthorized' ? 'Management Authorization' : 'Probable to Complete';
    const description = field === 'mgmtAuthorized'
        ? 'Projects must have management authorization before development costs can be capitalized under ASC 350-40.'
        : 'It must be probable the project will be completed and used as intended before costs can be capitalized.';

    // Get unique violating projects
    const seen = new Set<string>();
    const violatingProjects = entries
        .filter(e => !e.project[field])
        .filter(e => { if (seen.has(e.project.id)) return false; seen.add(e.project.id); return true; })
        .map(e => e.project);

    const [statuses, setStatuses] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const initial: Record<string, boolean> = {};
        violatingProjects.forEach(p => { initial[p.id] = p[field]; });
        setStatuses(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggle = async (projectId: string) => {
        const newValue = !statuses[projectId];
        setSaving(prev => ({ ...prev, [projectId]: true }));
        try {
            await fetch('/api/projects', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: projectId, [field]: newValue }),
            });
            setStatuses(prev => ({ ...prev, [projectId]: newValue }));
        } finally {
            setSaving(prev => ({ ...prev, [projectId]: false }));
        }
    };

    const allFixed = violatingProjects.length > 0 && violatingProjects.every(p => statuses[p.id]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg relative" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                {/* Modal Header */}
                <div className="p-6 pb-4" style={{ borderBottom: '1px solid #E2E4E9' }}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: allFixed ? '#EBF5EF' : '#FFF5F5' }}>
                                {allFixed
                                    ? <CheckCircle2 className="w-4 h-4" style={{ color: '#21944E' }} />
                                    : <AlertTriangle className="w-4 h-4" style={{ color: 'var(--envoy-red)' }} />
                                }
                            </div>
                            <h3 className="text-base font-bold" style={{ color: '#3F4450' }}>{label}</h3>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-xs" style={{ color: '#717684' }}>{description}</p>
                    {allFixed && (
                        <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#EBF5EF', border: '1px solid #D1F0DB' }}>
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#21944E' }} />
                            <span className="text-xs font-semibold" style={{ color: '#21944E' }}>All projects are now compliant</span>
                        </div>
                    )}
                </div>

                {/* Project List */}
                <div className="p-6 pt-4 overflow-y-auto" style={{ flex: 1 }}>
                    {violatingProjects.length === 0 ? (
                        <div className="text-center py-8">
                            <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: '#21944E' }} />
                            <p className="text-sm font-semibold" style={{ color: '#21944E' }}>All projects are compliant</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>
                                {violatingProjects.length} project{violatingProjects.length !== 1 ? 's' : ''} requiring action
                            </p>
                            {violatingProjects.map(project => (
                                <div
                                    key={project.id}
                                    className="flex items-center justify-between rounded-xl px-4 py-3.5 border transition-all"
                                    style={{
                                        borderColor: statuses[project.id] ? '#D1F0DB' : '#E2E4E9',
                                        background: statuses[project.id] ? '#F0FAF3' : '#FFFFFF',
                                    }}
                                >
                                    <div>
                                        <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{project.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="badge text-[9px]" style={{ background: `${project.status === 'DEV' ? '#4141A2' : '#21944E'}20`, color: project.status === 'DEV' ? '#4141A2' : '#21944E' }}>
                                                {project.status}
                                            </span>
                                            <span className="text-[10px]" style={{ color: '#A4A9B6' }}>
                                                {project.isCapitalizable ? 'Capitalizable' : 'Non-Capitalizable'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => toggle(project.id)}
                                        disabled={saving[project.id]}
                                        className={`toggle-switch ${statuses[project.id] ? 'active' : ''}`}
                                        style={{ opacity: saving[project.id] ? 0.5 : 1 }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="p-6 pt-4" style={{ borderTop: '1px solid #E2E4E9' }}>
                    <button onClick={onClose} className="btn-primary w-full">
                        {allFixed ? 'Done' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Sub-components ────────────────────────────────────────────── */
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
    return (
        <div className="glass-card p-4 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>
                    {icon}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>{label}</span>
            </div>
            <span className="text-xl font-bold" style={{ color: '#3F4450' }}>{value}</span>
        </div>
    );
}

function SummaryRow({ label, amount, total, count, tickets, color }: { label: string; amount: number; total: number; count: number; tickets: number; color: string }) {
    return (
        <tr style={{ borderBottom: '1px solid #F0F0F5' }}>
            <td className="py-2.5 flex items-center gap-2">
                <span className="w-3 h-3 rounded" style={{ background: color, display: 'inline-block' }} />
                <span className="text-xs font-medium" style={{ color: '#3F4450' }}>{label}</span>
            </td>
            <td className="py-2.5 text-right text-xs font-semibold" style={{ color }}>{fmt(amount)}</td>
            <td className="py-2.5 text-right text-xs" style={{ color: '#717684' }}>{total > 0 ? pct(amount / total) : '0%'}</td>
            <td className="py-2.5 text-right text-xs" style={{ color: '#717684' }}>{count}</td>
            <td className="py-2.5 text-right text-xs" style={{ color: '#717684' }}>{tickets}</td>
        </tr>
    );
}

function CompliancePill({ label, value, pass }: { label: string; value: string; pass?: boolean }) {
    return (
        <div className="rounded-lg px-3 py-2 border" style={{ borderColor: '#E2E4E9', background: '#FFFFFF' }}>
            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>{label}</p>
            <p className="text-xs font-bold mt-0.5" style={{ color: pass === undefined ? '#3F4450' : pass ? '#21944E' : 'var(--envoy-red)' }}>{value}</p>
        </div>
    );
}
