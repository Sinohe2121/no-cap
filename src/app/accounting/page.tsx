'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Calculator, BarChart2, RefreshCw,
    GitCompareArrows, Package, FileText, FlaskConical,
    Loader2, ListFilter,
} from 'lucide-react';
import { usePeriod } from '@/context/PeriodContext';


// ─── Types ────────────────────────────────────────────────────────────────────
interface FinancialRow {
    account: string;
    values: (number | null)[];
    total: number;
    color: string;
    bold?: boolean;
}
interface FinancialSection { title: string; type: string; rows: FinancialRow[]; }
interface FinancialReport { columns: string[]; sections: FinancialSection[]; }

interface RfProject {
    project: { id: string; name: string };
    beginningNBV: number;
    periodCapitalized: number;
    periodAmortized: number;
    endingNBV: number;
}
interface RollForwardData {
    projects: RfProject[];
    totals: { beginningNBV: number; periodCapitalized: number; periodAmortized: number; endingNBV: number };
}

const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

const TOOLS = [
    {
        href: '/reports/flux-analysis',
        icon: GitCompareArrows,
        iconBg: '#F3F0FF', iconColor: '#7B61FF', accentColor: '#7B61FF',
        title: 'Flux Analysis',
        description: 'AI-powered period-over-period flux commentary with capitalization, payroll, and velocity detail',
    },
    {
        href: '/audit',
        icon: Package,
        iconBg: '#FFF4E6', iconColor: '#F5A623', accentColor: '#F5A623',
        title: 'Audit Package',
        description: 'Streamline your audit preparation with pre-built documentation packages',
    },
    {
        href: '/memos',
        icon: FileText,
        iconBg: '#EEF2FF', iconColor: '#4141A2', accentColor: '#4141A2',
        title: 'Policy Memos',
        description: 'Draft and manage accounting policy memos and technical positions',
    },
    {
        href: '/rd-credit',
        icon: FlaskConical,
        iconBg: '#EBF5EF', iconColor: '#21944E', accentColor: '#21944E',
        title: 'R&D Credit',
        description: 'Maximize your R&D tax credit with comprehensive calculations',
    },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AccountingHubPage() {
    const { apiParams } = usePeriod();
    const [financialData, setFinancialData]   = useState<FinancialReport | null>(null);
    const [rollData, setRollData]             = useState<RollForwardData | null>(null);
    const [loading, setLoading]               = useState(true);

    // ── Classification rules: fetch count for the summary card ───────────────
    const [rulesCount, setRulesCount] = useState(0);
    useEffect(() => {
        fetch('/api/rules')
            .then(r => r.ok ? r.json() : [])
            .then((data: any[]) => setRulesCount(Array.isArray(data) ? data.length : 0));
    }, []);

    // Fetch financial data whenever the global period filter changes
    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetch(`/api/accounting/financial-report?${apiParams}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/accounting/roll-forward?${apiParams}`).then(r => r.ok ? r.json() : null),
        ]).then(([fin, rf]) => {
            setFinancialData(fin);
            setRollData(rf);
        }).finally(() => setLoading(false));
    }, [apiParams]);

    const plRows = financialData?.sections.find(s => s.type === 'pl')?.rows ?? [];
    const bsRows = financialData?.sections.find(s => s.type === 'balance_sheet')?.rows ?? [];
    const rfProjects = (rollData?.projects ?? []).slice(0, 4);

    return (
        <div>
            {/* ── Header ───────────────────────────────────────────────────────── */}
            <div className="mb-8">
                <h1 className="section-header" style={{ marginBottom: 4 }}>Accounting &amp; Reporting</h1>
                <p className="section-subtext">Journal entry management and financial statement views</p>
            </div>

            {/* ── Three main data cards ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

                {/* Journal Entries — P&L activity */}
                <div className="glass-card p-6 flex flex-col">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#EEF2FF' }}>
                            <Calculator className="w-4 h-4" style={{ color: '#4141A2' }} />
                        </div>
                        <h2 className="text-base font-bold" style={{ color: '#3F4450' }}>Journal Entries</h2>
                    </div>

                    <div className="flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A4A9B6' }} />
                            </div>
                        ) : (
                            <table className="w-full text-xs">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #E2E4E9' }}>
                                        <th className="text-left pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>Account</th>
                                        <th className="text-right pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>Last Period</th>
                                        <th className="text-right pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>YTD</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {plRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="py-8 text-center" style={{ color: '#A4A9B6' }}>
                                                No entries for this period
                                            </td>
                                        </tr>
                                    ) : plRows.map(row => {
                                        const lastVal = row.values[row.values.length - 1] ?? 0;
                                        return (
                                            <tr key={row.account} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                <td className="py-3 pr-2" style={{ color: '#3F4450', fontWeight: row.bold ? 700 : 400 }}>{row.account}</td>
                                                <td className="py-3 text-right font-mono" style={{ color: row.color }}>{fmt(lastVal)}</td>
                                                <td className="py-3 text-right font-mono" style={{ color: '#717684' }}>{fmt(row.total)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <Link
                        href="/accounting/journal-entries"
                        className="mt-5 block text-center px-4 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: '#4141A2', color: '#FFFFFF', textDecoration: 'none' }}
                    >
                        Open Full View →
                    </Link>
                </div>

                {/* Financial Reporting — Balance Sheet */}
                <div className="glass-card p-6 flex flex-col">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#EBF5EF' }}>
                            <BarChart2 className="w-4 h-4" style={{ color: '#21944E' }} />
                        </div>
                        <h2 className="text-base font-bold" style={{ color: '#3F4450' }}>Financial Reporting</h2>
                    </div>

                    <div className="flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A4A9B6' }} />
                            </div>
                        ) : (
                            <table className="w-full text-xs">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #E2E4E9' }}>
                                        <th className="text-left pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>Account</th>
                                        <th className="text-right pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>Balance</th>
                                        <th className="text-right pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>Period Δ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bsRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="py-8 text-center" style={{ color: '#A4A9B6' }}>
                                                No data for this period
                                            </td>
                                        </tr>
                                    ) : bsRows.map(row => {
                                        const lastVal = row.values[row.values.length - 1] ?? 0;
                                        const prevVal = row.values.length > 1 ? (row.values[row.values.length - 2] ?? 0) : 0;
                                        const delta   = lastVal - prevVal;
                                        return (
                                            <tr key={row.account} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                <td className="py-3 pr-2" style={{ color: '#3F4450', fontWeight: row.bold ? 700 : 400 }}>{row.account}</td>
                                                <td className="py-3 text-right font-mono" style={{ color: row.bold ? '#4141A2' : '#3F4450', fontWeight: row.bold ? 700 : 400 }}>
                                                    {fmt(lastVal)}
                                                </td>
                                                <td className="py-3 text-right font-mono" style={{ color: delta >= 0 ? '#21944E' : '#FA4338' }}>
                                                    {delta >= 0 ? '+' : ''}{fmt(delta)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <Link
                        href="/accounting/financial-reporting"
                        className="mt-5 block text-center px-4 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: '#4141A2', color: '#FFFFFF', textDecoration: 'none' }}
                    >
                        Open Full View →
                    </Link>
                </div>

                {/* Roll-Forward Schedule */}
                <div className="glass-card p-6 flex flex-col">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#FFF4E6' }}>
                            <RefreshCw className="w-4 h-4" style={{ color: '#F5A623' }} />
                        </div>
                        <h2 className="text-base font-bold" style={{ color: '#3F4450' }}>Roll-Forward Schedule</h2>
                    </div>

                    <div className="flex-1 overflow-x-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A4A9B6' }} />
                            </div>
                        ) : (
                            <table className="w-full text-xs">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #E2E4E9' }}>
                                        <th className="text-left pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>Project</th>
                                        <th className="text-right pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>Beg. NBV</th>
                                        <th className="text-right pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>Add.</th>
                                        <th className="text-right pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>Amort.</th>
                                        <th className="text-right pb-2.5 font-semibold" style={{ color: '#A4A9B6' }}>End NBV</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rfProjects.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center" style={{ color: '#A4A9B6' }}>
                                                No activity for this period
                                            </td>
                                        </tr>
                                    ) : (
                                        <>
                                            {rfProjects.map(r => (
                                                <tr key={r.project.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                    <td className="py-3 pr-1" style={{ color: '#3F4450', maxWidth: 80 }} title={r.project.name}>
                                                        {r.project.name.length > 14 ? r.project.name.slice(0, 14) + '…' : r.project.name}
                                                    </td>
                                                    <td className="py-3 text-right font-mono" style={{ color: '#717684' }}>{fmt(r.beginningNBV)}</td>
                                                    <td className="py-3 text-right font-mono" style={{ color: '#21944E' }}>{fmt(r.periodCapitalized)}</td>
                                                    <td className="py-3 text-right font-mono" style={{ color: '#FA4338' }}>{fmt(r.periodAmortized)}</td>
                                                    <td className="py-3 text-right font-mono font-semibold" style={{ color: '#4141A2' }}>{fmt(r.endingNBV)}</td>
                                                </tr>
                                            ))}
                                            {rollData?.totals && (
                                                <tr style={{ borderTop: '2px solid #E2E4E9' }}>
                                                    <td className="pt-3 font-bold text-xs" style={{ color: '#3F4450' }}>Total</td>
                                                    <td className="pt-3 text-right font-mono font-bold" style={{ color: '#717684' }}>{fmt(rollData.totals.beginningNBV)}</td>
                                                    <td className="pt-3 text-right font-mono font-bold" style={{ color: '#21944E' }}>{fmt(rollData.totals.periodCapitalized)}</td>
                                                    <td className="pt-3 text-right font-mono font-bold" style={{ color: '#FA4338' }}>{fmt(rollData.totals.periodAmortized)}</td>
                                                    <td className="pt-3 text-right font-mono font-bold" style={{ color: '#4141A2' }}>{fmt(rollData.totals.endingNBV)}</td>
                                                </tr>
                                            )}
                                        </>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <Link
                        href="/accounting/roll-forward"
                        className="mt-5 block text-center px-4 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: '#4141A2', color: '#FFFFFF', textDecoration: 'none' }}
                    >
                        Open Full View →
                    </Link>
                </div>
            </div>

            {/* ── Four tool cards ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {TOOLS.map(tool => {
                    const Icon = tool.icon;
                    return (
                        <Link key={tool.href} href={tool.href} style={{ textDecoration: 'none' }}>
                            <div className="glass-card p-5 h-full flex flex-col" style={{ cursor: 'pointer' }}>
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 flex-shrink-0"
                                    style={{ background: tool.iconBg }}
                                >
                                    <Icon className="w-5 h-5" style={{ color: tool.iconColor }} />
                                </div>
                                <h3 className="text-sm font-bold mb-1.5" style={{ color: '#3F4450' }}>{tool.title}</h3>
                                <p className="text-xs leading-relaxed mb-4 flex-1" style={{ color: '#A4A9B6' }}>{tool.description}</p>
                                <span className="text-xs font-semibold" style={{ color: tool.accentColor }}>Launch →</span>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* ── Classification Rules (summary card) ──────────────────── */}
            <Link href="/accounting/classification-rules" style={{ textDecoration: 'none' }}>
                <div className="glass-card p-6 flex items-center justify-between" style={{ cursor: 'pointer' }}>
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F5F3FF' }}>
                            <ListFilter className="w-5 h-5" style={{ color: '#4141A2' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>Classification Rules</h2>
                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>
                                Priority-ordered rules that determine how each ticket is classified for capitalization
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <p className="text-xl font-black" style={{ color: '#4141A2' }}>{rulesCount}</p>
                            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#A4A9B6' }}>Active Rules</p>
                        </div>
                        <span className="text-sm font-semibold" style={{ color: '#4141A2' }}>Manage →</span>
                    </div>
                </div>
            </Link>
        </div>
    );
}
