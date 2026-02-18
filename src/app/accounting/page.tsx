'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Calculator, FileDown, Search, X, DollarSign, TrendingDown, ClipboardList, ChevronDown, ChevronRight } from 'lucide-react';

interface Period {
    id: string;
    month: number;
    year: number;
    status: string;
    totalCapitalized: number;
    totalExpensed: number;
    totalAmortization: number;
    journalEntries: JournalEntry[];
}

interface JournalEntry {
    id: string;
    entryType: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    description: string;
    project: { id: string; name: string };
}

interface DevSummary {
    name: string;
    ticketCount: number;
    totalPoints: number;
    totalAmount: number;
}

interface AmortDetails {
    totalCostBasis: number;
    accumulatedCost: number;
    startingBalance: number;
    startingAmortization: number;
    usefulLifeMonths: number;
    monthlyRate: number;
    monthsElapsed: number;
    totalAmortization: number;
    netBookValue: number;
    launchDate: string;
}

interface AuditDetail {
    id: string;
    entryType: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    description: string;
    project: { id: string; name: string; status: string };
    period: { month: number; year: number };
    auditTrails: {
        id: string;
        developerName: string;
        ticketId: string;
        allocatedAmount: number;
        jiraTicket: { summary: string; issueType: string; storyPoints: number };
    }[];
    developerSummary?: DevSummary[];
    amortizationDetails?: AmortDetails;
}

interface PayrollAuditDev {
    name: string;
    capitalized: number;
    expensed: number;
    total: number;
    totalPayroll: number;
    delta: number;
}

interface PayrollAuditData {
    developers: PayrollAuditDev[];
    totals: Omit<PayrollAuditDev, 'name'>;
    month: number;
    year: number;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const entryTypeConfig: Record<string, { label: string; bg: string; color: string; icon: string }> = {
    CAPITALIZATION: { label: 'Capitalization', bg: '#EBF5EF', color: '#21944E', icon: '💰' },
    EXPENSE: { label: 'Expense', bg: '#FFF5F5', color: '#FA4338', icon: '📝' },
    AMORTIZATION: { label: 'Amortization', bg: '#F0EAF8', color: '#4141A2', icon: '📉' },
};

export default function AccountingPage() {
    const [periods, setPeriods] = useState<Period[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [genResult, setGenResult] = useState<string | null>(null);
    const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
    const [genYear, setGenYear] = useState(new Date().getFullYear());
    const [auditDetail, setAuditDetail] = useState<AuditDetail | null>(null);
    const [showLegacy, setShowLegacy] = useState(false);
    const [legacyForm, setLegacyForm] = useState({ projectId: '', costBasis: '', accumAmort: '', goLiveDate: '', usefulLifeMonths: '36' });
    const [payrollAudit, setPayrollAudit] = useState<PayrollAuditData | null>(null);
    const [payrollAuditLoading, setPayrollAuditLoading] = useState(false);
    const [collapsedPeriods, setCollapsedPeriods] = useState<Set<string>>(new Set());

    const togglePeriod = (id: string) => {
        setCollapsedPeriods((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const loadPeriods = () => {
        fetch('/api/accounting')
            .then((res) => res.json())
            .then(setPeriods)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadPeriods(); }, []);

    const generateEntries = async () => {
        setGenerating(true);
        setGenResult(null);
        try {
            const res = await fetch('/api/accounting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: genMonth, year: genYear }),
            });
            const data = await res.json();
            setGenResult(`✓ Generated: Cap ${formatCurrency(data.totalCapitalized)} · Exp ${formatCurrency(data.totalExpensed)} · Amort ${formatCurrency(data.totalAmortization)}`);
            loadPeriods();
        } catch {
            setGenResult('✗ Generation failed');
        } finally {
            setGenerating(false);
        }
    };

    const showAudit = async (entryId: string) => {
        const res = await fetch(`/api/accounting/${entryId}`);
        const data = await res.json();
        setAuditDetail(data);
    };

    const showPayrollAudit = async (month: number, year: number) => {
        setPayrollAuditLoading(true);
        try {
            const res = await fetch(`/api/accounting/payroll-audit?month=${month}&year=${year}`);
            const data = await res.json();
            setPayrollAudit(data);
        } finally {
            setPayrollAuditLoading(false);
        }
    };

    const saveLegacy = async () => {
        if (!legacyForm.projectId) return;
        await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: legacyForm.projectId,
                startingBalance: parseFloat(legacyForm.costBasis) || 0,
                startingAmortization: parseFloat(legacyForm.accumAmort) || 0,
                launchDate: legacyForm.goLiveDate || null,
                amortizationMonths: parseInt(legacyForm.usefulLifeMonths) || 36,
            }),
        });
        setShowLegacy(false);
        setLegacyForm({ projectId: '', costBasis: '', accumAmort: '', goLiveDate: '', usefulLifeMonths: '36' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    const typeConf = auditDetail ? entryTypeConfig[auditDetail.entryType] || entryTypeConfig['EXPENSE'] : null;

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-header">Accounting & Reporting</h1>
                    <p className="section-subtext">Journal entry generation and audit trail</p>
                </div>
                <button onClick={() => setShowLegacy(true)} className="btn-secondary">
                    <FileDown className="w-4 h-4" /> Legacy Opening Balances
                </button>
            </div>

            {/* Journal Entry Generator */}
            <div className="glass-card p-6 mb-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F0EAF8' }}>
                        <Calculator className="w-5 h-5" style={{ color: '#4141A2' }} />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Journal Entry Generator</h2>
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>Calculate and generate entries for a period</p>
                    </div>
                </div>

                <div className="flex items-end gap-4">
                    <div>
                        <label className="form-label">Month</label>
                        <select value={genMonth} onChange={(e) => setGenMonth(+e.target.value)} className="form-select" style={{ width: 160 }}>
                            {MONTHS.map((m, i) => (
                                <option key={i} value={i + 1}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="form-label">Year</label>
                        <select value={genYear} onChange={(e) => setGenYear(+e.target.value)} className="form-select" style={{ width: 120 }}>
                            {[2024, 2025, 2026].map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={generateEntries} disabled={generating} className="btn-primary">
                        {generating ? <Calculator className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                        {generating ? 'Calculating...' : 'Generate Entries'}
                    </button>
                </div>

                {genResult && (
                    <p className="mt-4 text-sm" style={{ color: '#21944E' }}>{genResult}</p>
                )}

                {/* Entry Guidance */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <div className="border rounded-xl p-4" style={{ background: '#EBF5EF', borderColor: 'rgba(33,148,78,0.2)' }}>
                        <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="w-4 h-4" style={{ color: '#21944E' }} />
                            <span className="text-xs font-semibold uppercase" style={{ color: '#21944E' }}>Capitalization</span>
                        </div>
                        <div className="space-y-1.5 text-xs" style={{ color: '#717684' }}>
                            <p><span className="font-medium" style={{ color: '#3F4450' }}>DR:</span> WIP — Software Assets</p>
                            <p><span className="font-medium" style={{ color: '#3F4450' }}>CR:</span> R&D Salaries / Payroll Expense</p>
                        </div>
                    </div>
                    <div className="border rounded-xl p-4" style={{ background: '#FFF5F5', borderColor: 'rgba(250,67,56,0.2)' }}>
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="w-4 h-4" style={{ color: '#FA4338' }} />
                            <span className="text-xs font-semibold uppercase" style={{ color: '#FA4338' }}>Amortization</span>
                        </div>
                        <div className="space-y-1.5 text-xs" style={{ color: '#717684' }}>
                            <p><span className="font-medium" style={{ color: '#3F4450' }}>DR:</span> Amortization Expense</p>
                            <p><span className="font-medium" style={{ color: '#3F4450' }}>CR:</span> Accumulated Amortization — Software</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Period History */}
            <div className="glass-card p-6">
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#3F4450' }}>
                    <BookOpen className="w-4 h-4" style={{ color: '#A4A9B6' }} /> Accounting Periods
                </h2>

                <div className="space-y-4">
                    {periods.map((period) => (
                        <div key={period.id} className="rounded-xl p-4" style={{ background: '#F6F6F9' }}>
                            <div className="flex items-center justify-between" style={{ cursor: 'pointer' }}>
                                <div className="flex items-center gap-3" onClick={() => togglePeriod(period.id)}>
                                    {collapsedPeriods.has(period.id)
                                        ? <ChevronRight className="w-4 h-4" style={{ color: '#A4A9B6' }} />
                                        : <ChevronDown className="w-4 h-4" style={{ color: '#A4A9B6' }} />
                                    }
                                    <h3 className="text-sm font-semibold" style={{ color: '#3F4450' }}>
                                        {MONTHS[period.month - 1]} {period.year}
                                    </h3>
                                    <span className="badge border" style={{
                                        borderColor: period.status === 'OPEN' ? '#4141A2' : '#A4A9B6',
                                        color: period.status === 'OPEN' ? '#4141A2' : '#717684',
                                    }}>
                                        {period.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs">
                                    <span className="font-semibold" style={{ color: '#21944E' }}>Cap: {formatCurrency(period.totalCapitalized)}</span>
                                    <span className="font-semibold" style={{ color: '#FA4338' }}>Exp: {formatCurrency(period.totalExpensed)}</span>
                                    <span className="font-semibold" style={{ color: '#4141A2' }}>Amort: {formatCurrency(period.totalAmortization)}</span>
                                    <button
                                        onClick={() => showPayrollAudit(period.month, period.year)}
                                        className="btn-ghost text-xs"
                                        disabled={payrollAuditLoading}
                                        style={{ marginLeft: 4 }}
                                    >
                                        <ClipboardList className="w-3.5 h-3.5" /> Payroll Audit
                                    </button>
                                    <button
                                        onClick={() => {
                                            window.location.href = `/api/accounting/export?month=${period.month}&year=${period.year}`;
                                        }}
                                        className="btn-ghost text-xs"
                                        style={{ marginLeft: 4 }}
                                    >
                                        <FileDown className="w-3.5 h-3.5" /> Download CSV
                                    </button>
                                </div>
                            </div>

                            {!collapsedPeriods.has(period.id) && period.journalEntries.length > 0 && (
                                <div className="rounded-lg overflow-hidden mt-3" style={{ background: '#FFFFFF' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Type</th>
                                                <th>Debit</th>
                                                <th>Credit</th>
                                                <th>Project</th>
                                                <th className="text-right">Amount</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {period.journalEntries.map((entry) => (
                                                <tr key={entry.id}>
                                                    <td>
                                                        <span className="badge" style={{
                                                            background: entry.entryType === 'CAPITALIZATION' ? '#EBF5EF' : entry.entryType === 'AMORTIZATION' ? '#F0EAF8' : '#FFF5F5',
                                                            color: entry.entryType === 'CAPITALIZATION' ? '#21944E' : entry.entryType === 'AMORTIZATION' ? '#4141A2' : '#FA4338',
                                                        }}>
                                                            {entry.entryType}
                                                        </span>
                                                    </td>
                                                    <td className="text-xs">{entry.debitAccount}</td>
                                                    <td className="text-xs">{entry.creditAccount}</td>
                                                    <td className="text-xs" style={{ color: '#717684' }}>{entry.project.name}</td>
                                                    <td className="text-right font-semibold text-sm" style={{ color: '#3F4450' }}>{formatCurrency(entry.amount)}</td>
                                                    <td>
                                                        <button onClick={() => showAudit(entry.id)} className="btn-ghost text-xs">
                                                            <Search className="w-3 h-3" /> Audit
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {!collapsedPeriods.has(period.id) && period.journalEntries.length === 0 && (
                                <p className="text-xs italic mt-3" style={{ color: '#A4A9B6' }}>No journal entries generated for this period</p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* ─── Audit Trail Modal ─── */}
            {auditDetail && typeConf && (
                <div className="modal-overlay" onClick={() => setAuditDetail(null)}>
                    <div className="modal-content" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="text-xl">{typeConf.icon}</span>
                                    <h2 className="text-lg font-bold" style={{ color: '#3F4450' }}>Audit Trail</h2>
                                    <span className="badge" style={{ background: typeConf.bg, color: typeConf.color, fontSize: 11 }}>
                                        {typeConf.label}
                                    </span>
                                </div>
                                <p className="text-xs" style={{ color: '#A4A9B6' }}>
                                    {auditDetail.project.name} — {MONTHS[(auditDetail.period.month || 1) - 1]} {auditDetail.period.year}
                                </p>
                            </div>
                            <button onClick={() => setAuditDetail(null)} style={{ color: '#A4A9B6' }} className="hover:opacity-70">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Journal Entry Summary */}
                        <div className="rounded-xl p-4 mb-5" style={{ background: '#F6F6F9' }}>
                            <div className="grid grid-cols-3 gap-4 text-xs">
                                <div>
                                    <p className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#A4A9B6', fontSize: 10 }}>Debit</p>
                                    <p className="font-medium" style={{ color: '#3F4450' }}>{auditDetail.debitAccount}</p>
                                </div>
                                <div>
                                    <p className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#A4A9B6', fontSize: 10 }}>Credit</p>
                                    <p className="font-medium" style={{ color: '#3F4450' }}>{auditDetail.creditAccount}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#A4A9B6', fontSize: 10 }}>Amount</p>
                                    <p className="text-base font-bold" style={{ color: typeConf.color }}>{formatCurrency(auditDetail.amount)}</p>
                                </div>
                            </div>
                            {auditDetail.description && (
                                <p className="mt-3 text-xs italic" style={{ color: '#717684' }}>{auditDetail.description}</p>
                            )}
                        </div>

                        {/* Amortization Schedule (for AMORTIZATION entries) */}
                        {auditDetail.amortizationDetails && (
                            <div className="mb-5">
                                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#A4A9B6' }}>
                                    Amortization Schedule
                                </h3>
                                <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9' }}>
                                    <table className="w-full text-xs">
                                        <tbody>
                                            {[
                                                ['Total Cost Basis', formatCurrency(auditDetail.amortizationDetails.totalCostBasis)],
                                                ['Accumulated Dev Cost', formatCurrency(auditDetail.amortizationDetails.accumulatedCost)],
                                                ['Starting Balance (Legacy)', formatCurrency(auditDetail.amortizationDetails.startingBalance)],
                                                ['Useful Life', `${auditDetail.amortizationDetails.usefulLifeMonths} months`],
                                                ['Monthly Amortization Rate', formatCurrency(auditDetail.amortizationDetails.monthlyRate)],
                                                ['Months Elapsed', `${auditDetail.amortizationDetails.monthsElapsed} / ${auditDetail.amortizationDetails.usefulLifeMonths}`],
                                                ['Accumulated Amortization', formatCurrency(auditDetail.amortizationDetails.totalAmortization)],
                                                ['Net Book Value', formatCurrency(auditDetail.amortizationDetails.netBookValue)],
                                                ['Launch Date', new Date(auditDetail.amortizationDetails.launchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
                                            ].map(([label, value], i) => (
                                                <tr key={i} style={{ borderBottom: i < 8 ? '1px solid #E2E4E9' : 'none' }}>
                                                    <td className="px-4 py-2.5 font-medium" style={{ color: '#717684' }}>{label}</td>
                                                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: '#3F4450' }}>{value}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Developer Summary (for CAP/EXPENSE entries with audit trails) */}
                        {auditDetail.developerSummary && auditDetail.developerSummary.length > 0 && (
                            <div className="mb-5">
                                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#A4A9B6' }}>
                                    Developer Cost Breakdown
                                </h3>
                                <div className="rounded-lg overflow-hidden border" style={{ borderColor: '#E2E4E9' }}>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #E2E4E9', background: '#F6F6F9' }}>
                                                <th className="px-4 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>DEVELOPER</th>
                                                <th className="px-4 py-2 text-right font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>TICKETS</th>
                                                <th className="px-4 py-2 text-right font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>POINTS</th>
                                                <th className="px-4 py-2 text-right font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>AMOUNT</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {auditDetail.developerSummary.map((dev, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #E2E4E9' }}>
                                                    <td className="px-4 py-2.5 font-medium" style={{ color: '#3F4450' }}>{dev.name}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#717684' }}>{dev.ticketCount}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#717684' }}>{dev.totalPoints}</td>
                                                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: typeConf.color }}>{formatCurrency(dev.totalAmount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Detailed Ticket Trail */}
                        {auditDetail.auditTrails.length > 0 && (
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#A4A9B6' }}>
                                    Ticket-Level Detail
                                </h3>
                                <div className="rounded-lg overflow-hidden border" style={{ borderColor: '#E2E4E9' }}>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #E2E4E9', background: '#F6F6F9' }}>
                                                <th className="px-4 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>DEVELOPER</th>
                                                <th className="px-4 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>TICKET</th>
                                                <th className="px-4 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>SUMMARY</th>
                                                <th className="px-4 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>TYPE</th>
                                                <th className="px-4 py-2 text-right font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>PTS</th>
                                                <th className="px-4 py-2 text-right font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>AMOUNT</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {auditDetail.auditTrails.map((trail) => (
                                                <tr key={trail.id} style={{ borderBottom: '1px solid #E2E4E9' }}>
                                                    <td className="px-4 py-2.5" style={{ color: '#3F4450' }}>{trail.developerName}</td>
                                                    <td className="px-4 py-2.5"><span className="font-mono" style={{ color: '#4141A2' }}>{trail.ticketId}</span></td>
                                                    <td className="px-4 py-2.5 max-w-[180px] truncate" style={{ color: '#717684' }}>{trail.jiraTicket.summary}</td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="badge" style={{
                                                            background: trail.jiraTicket.issueType === 'STORY' ? '#EBF5EF' : trail.jiraTicket.issueType === 'BUG' ? '#FFF5F5' : '#F6F6F9',
                                                            color: trail.jiraTicket.issueType === 'STORY' ? '#21944E' : trail.jiraTicket.issueType === 'BUG' ? '#FA4338' : '#717684',
                                                            fontSize: 10,
                                                        }}>
                                                            {trail.jiraTicket.issueType}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#717684' }}>{trail.jiraTicket.storyPoints}</td>
                                                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: '#3F4450' }}>{formatCurrency(trail.allocatedAmount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {auditDetail.auditTrails.length === 0 && !auditDetail.amortizationDetails && (
                            <p className="text-sm py-4 text-center" style={{ color: '#A4A9B6' }}>No granular audit records for this entry</p>
                        )}
                    </div>
                </div>
            )}

            {/* Legacy Balance Modal */}
            {showLegacy && (
                <div className="modal-overlay" onClick={() => setShowLegacy(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold" style={{ color: '#3F4450' }}>Legacy Opening Balances</h2>
                            <button onClick={() => setShowLegacy(false)} style={{ color: '#A4A9B6' }} className="hover:opacity-70">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs mb-4" style={{ color: '#A4A9B6' }}>Input opening cost basis, accumulated amortization, and depreciation schedule for existing software assets.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="form-label">Project ID</label>
                                <input
                                    value={legacyForm.projectId}
                                    onChange={(e) => setLegacyForm({ ...legacyForm, projectId: e.target.value })}
                                    placeholder="Select or enter project ID"
                                    className="form-input"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Cost Basis ($)</label>
                                    <input
                                        type="number"
                                        value={legacyForm.costBasis}
                                        onChange={(e) => setLegacyForm({ ...legacyForm, costBasis: e.target.value })}
                                        placeholder="0.00"
                                        className="form-input"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Accumulated Amortization ($)</label>
                                    <input
                                        type="number"
                                        value={legacyForm.accumAmort}
                                        onChange={(e) => setLegacyForm({ ...legacyForm, accumAmort: e.target.value })}
                                        placeholder="0.00"
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            {/* Depreciation Schedule */}
                            <div style={{ borderTop: '1px solid #E2E4E9', paddingTop: 16 }}>
                                <p className="text-xs font-semibold mb-3" style={{ color: '#3F4450' }}>Depreciation Schedule</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="form-label">Go-Live Date (Depreciation Start)</label>
                                        <input
                                            type="date"
                                            value={legacyForm.goLiveDate}
                                            onChange={(e) => setLegacyForm({ ...legacyForm, goLiveDate: e.target.value })}
                                            className="form-input"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">Useful Life (Months)</label>
                                        <input
                                            type="number"
                                            value={legacyForm.usefulLifeMonths}
                                            onChange={(e) => setLegacyForm({ ...legacyForm, usefulLifeMonths: e.target.value })}
                                            placeholder="36"
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                                {legacyForm.goLiveDate && legacyForm.usefulLifeMonths && (() => {
                                    const start = new Date(legacyForm.goLiveDate);
                                    const months = parseInt(legacyForm.usefulLifeMonths) || 36;
                                    const end = new Date(start);
                                    end.setMonth(end.getMonth() + months);
                                    const costBasis = parseFloat(legacyForm.costBasis) || 0;
                                    const monthlyDepr = costBasis > 0 ? costBasis / months : 0;
                                    return (
                                        <div className="mt-3 p-3 rounded-lg" style={{ background: '#F6F6F9' }}>
                                            <div className="flex items-center gap-6">
                                                <span className="text-xs" style={{ color: '#A4A9B6' }}>
                                                    End Date: <span className="font-semibold" style={{ color: '#3F4450' }}>{end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </span>
                                                <span className="text-xs" style={{ color: '#A4A9B6' }}>
                                                    Monthly Depreciation: <span className="font-semibold" style={{ color: '#21944E' }}>${monthlyDepr.toFixed(2)}</span>
                                                </span>
                                                <span className="text-xs" style={{ color: '#A4A9B6' }}>
                                                    Remaining Life: <span className="font-semibold" style={{ color: '#4141A2' }}>{months} mo</span>
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <button onClick={saveLegacy} className="btn-primary">Save Opening Balances</button>
                        </div>
                    </div>
                </div>
            )}
            {/* ─── Payroll Audit Ledger Modal ─── */}
            {payrollAudit && (
                <div className="modal-overlay" onClick={() => setPayrollAudit(null)}>
                    <div className="modal-content" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <ClipboardList className="w-5 h-5" style={{ color: '#4141A2' }} />
                                    <h2 className="text-lg font-bold" style={{ color: '#3F4450' }}>Payroll Audit Ledger</h2>
                                </div>
                                <p className="text-xs" style={{ color: '#A4A9B6' }}>
                                    {MONTHS[(payrollAudit.month || 1) - 1]} {payrollAudit.year} — Capitalized vs Expensed salary breakdown by developer
                                </p>
                            </div>
                            <button onClick={() => setPayrollAudit(null)} style={{ color: '#A4A9B6' }} className="hover:opacity-70">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Ledger Table */}
                        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9' }}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ background: '#F6F6F9', borderBottom: '2px solid #E2E4E9' }}>
                                        <th className="px-4 py-3 text-left font-semibold" style={{ color: '#3F4450' }}>Name</th>
                                        <th className="px-4 py-3 text-right font-semibold" style={{ color: '#21944E' }}>Capitalized</th>
                                        <th className="px-4 py-3 text-right font-semibold" style={{ color: '#FA4338' }}>Expensed</th>
                                        <th className="px-4 py-3 text-right font-semibold" style={{ color: '#3F4450' }}>Total</th>
                                        <th className="px-4 py-3 text-right font-semibold" style={{ color: '#4141A2' }}>Total Payroll</th>
                                        <th className="px-4 py-3 text-right font-semibold" style={{ color: '#717684' }}>Delta</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payrollAudit.developers.map((dev, i) => (
                                        <tr
                                            key={i}
                                            className="transition-colors"
                                            style={{ borderBottom: '1px solid #E2E4E9' }}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F6F9')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <td className="px-4 py-3 font-medium" style={{ color: '#3F4450' }}>{dev.name}</td>
                                            <td className="px-4 py-3 text-right tabular-nums" style={{ color: '#21944E' }}>{formatCurrency(dev.capitalized)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums" style={{ color: '#FA4338' }}>{formatCurrency(dev.expensed)}</td>
                                            <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: '#3F4450' }}>{formatCurrency(dev.total)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums" style={{ color: '#4141A2' }}>{formatCurrency(dev.totalPayroll)}</td>
                                            <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: Math.abs(dev.delta) < 0.01 ? '#21944E' : '#FA4338' }}>
                                                {formatCurrency(dev.delta)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #E2E4E9', background: '#F6F6F9' }}>
                                        <td className="px-4 py-3 font-bold" style={{ color: '#3F4450' }}>Total</td>
                                        <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: '#21944E' }}>{formatCurrency(payrollAudit.totals.capitalized)}</td>
                                        <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: '#FA4338' }}>{formatCurrency(payrollAudit.totals.expensed)}</td>
                                        <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: '#3F4450' }}>{formatCurrency(payrollAudit.totals.total)}</td>
                                        <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: '#4141A2' }}>{formatCurrency(payrollAudit.totals.totalPayroll)}</td>
                                        <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: Math.abs(payrollAudit.totals.delta) < 0.01 ? '#21944E' : '#FA4338' }}>
                                            {formatCurrency(payrollAudit.totals.delta)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Tie-out note */}
                        <div className="mt-4 rounded-lg p-3" style={{ background: '#F6F6F9' }}>
                            <p className="text-xs" style={{ color: '#717684' }}>
                                <span className="font-semibold" style={{ color: '#3F4450' }}>Tie-out: </span>
                                Capitalized total should equal period Cap ({formatCurrency(payrollAudit.totals.capitalized)}),
                                Expensed total should equal period Exp ({formatCurrency(payrollAudit.totals.expensed)}).
                                Delta of {formatCurrency(payrollAudit.totals.delta)} indicates
                                {Math.abs(payrollAudit.totals.delta) < 0.01
                                    ? ' ✓ totals tie perfectly.'
                                    : ' ⚠ a variance exists — review allocation methodology.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
