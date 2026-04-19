'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart2, TrendingUp, TrendingDown, RefreshCw, DollarSign } from 'lucide-react';
import { usePeriod } from '@/context/PeriodContext';
import { EmptyState } from '@/components/ui/EmptyState';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface ReportRow {
    account: string;
    values: (number | null)[];
    total: number;
    color: string;
    bold?: boolean;
}

interface ReportSection {
    title: string;
    subtitle: string;
    type: 'balance_sheet' | 'pl';
    rows: ReportRow[];
}

interface FinancialReport {
    columns: string[];
    sections: ReportSection[];
}

function formatCurrency(n: number | null) {
    if (n === null) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(n);
}

const SECTION_ICONS = { balance_sheet: TrendingUp, pl: TrendingDown };
const SECTION_COLORS = { balance_sheet: '#4141A2', pl: '#FA4338' };
const SECTION_BG = { balance_sheet: '#EEF2FF', pl: '#FFF5F5' };

export default function FinancialReportingPage() {
    const { apiParams, label } = usePeriod();
    const [report, setReport] = useState<FinancialReport | null>(null);
    const [quarterlyPL, setQuarterlyPL] = useState<{ quarters: any[]; totals: any } | null>(null);
    const [loading, setLoading] = useState(true);

    const loadReport = () => {
        setLoading(true);
        Promise.all([
            fetch(`/api/accounting/financial-report?${apiParams}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/accounting/quarterly-pl?${apiParams}`).then(r => r.ok ? r.json() : null),
        ])
            .then(([reportData, plData]) => {
                setReport(reportData);
                setQuarterlyPL(plData);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadReport(); }, [apiParams]);

    const colCount = report?.columns?.length ?? 0;
    const hasData = colCount > 0;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link href="/accounting" style={{ textDecoration: 'none' }}>
                            <span className="text-xs font-medium" style={{ color: '#A4A9B6' }}>
                                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
                                Accounting &amp; Reporting
                            </span>
                        </Link>
                    </div>
                    <h1 className="section-header">Financial Reporting</h1>
                    <p className="section-subtext">Software capitalization financial statement — {label}</p>
                </div>
                <button onClick={loadReport} className="btn-secondary" disabled={loading}>
                    <RefreshCw className={`w-4 h-4${loading ? ' animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {loading && (
                <div className="flex items-center justify-center h-[50vh]">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
                </div>
            )}

            {!loading && !hasData && (
                <EmptyState
                    icon={BarChart2}
                    title="No accounting periods found"
                    description="Generate journal entries for at least one period to see the financial statement with Balance Sheet and P&L views."
                    ctaLabel="Go to Journal Entries"
                    ctaHref="/accounting/journal-entries"
                    secondaryLabel="Accounting Hub"
                    secondaryHref="/accounting"
                />
            )}

            {!loading && hasData && report && (
                <div className="space-y-8">
                    {report.sections.map((section) => {
                        const SectionIcon = SECTION_ICONS[section.type];
                        const accentColor = SECTION_COLORS[section.type];
                        const accentBg = SECTION_BG[section.type];

                        return (
                            <div key={section.title} className="glass-card" style={{ overflow: 'hidden' }}>
                                {/* Section header */}
                                <div
                                    className="flex items-center gap-3 px-6 py-4"
                                    style={{ borderBottom: '1px solid #E2E4E9', background: '#FAFAFA' }}
                                >
                                    <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{ background: accentBg }}
                                    >
                                        <SectionIcon className="w-4 h-4" style={{ color: accentColor }} />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>{section.title}</h2>
                                        <p className="text-xs" style={{ color: '#A4A9B6' }}>{section.subtitle}</p>
                                    </div>
                                </div>

                                {/* Scrollable table */}
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 600 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #E2E4E9', background: '#F6F6F9' }}>
                                                {/* Account column */}
                                                <th
                                                    style={{
                                                        padding: '10px 20px',
                                                        textAlign: 'left',
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        color: '#A4A9B6',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.06em',
                                                        whiteSpace: 'nowrap',
                                                        position: 'sticky',
                                                        left: 0,
                                                        background: '#F6F6F9',
                                                        zIndex: 2,
                                                        borderRight: '1px solid #E2E4E9',
                                                        minWidth: 240,
                                                    }}
                                                >
                                                    Account
                                                </th>
                                                {/* Month columns */}
                                                {report.columns.map((col) => (
                                                    <th
                                                        key={col}
                                                        style={{
                                                            padding: '10px 16px',
                                                            textAlign: 'right',
                                                            fontSize: 11,
                                                            fontWeight: 700,
                                                            color: '#3F4450',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.04em',
                                                            whiteSpace: 'nowrap',
                                                            minWidth: 120,
                                                        }}
                                                    >
                                                        {col}
                                                    </th>
                                                ))}
                                                {/* Total column */}
                                                <th
                                                    style={{
                                                        padding: '10px 20px',
                                                        textAlign: 'right',
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        color: accentColor,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.04em',
                                                        whiteSpace: 'nowrap',
                                                        borderLeft: '2px solid #E2E4E9',
                                                        background: accentBg,
                                                        minWidth: 130,
                                                    }}
                                                >
                                                    {section.type === 'balance_sheet' ? 'As of End of Period' : 'Period Total'}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {section.rows.map((row, rowIndex) => {
                                                const isBold = row.bold;
                                                const isLast = rowIndex === section.rows.length - 1;
                                                const rowBg = isBold ? `${row.color}08` : 'transparent';

                                                return (
                                                    <tr
                                                        key={row.account}
                                                        style={{
                                                            borderBottom: isLast ? 'none' : '1px solid #E2E4E9',
                                                            background: rowBg,
                                                        }}
                                                    >
                                                        {/* Account name */}
                                                        <td
                                                            style={{
                                                                padding: '13px 20px',
                                                                fontSize: 13,
                                                                fontWeight: isBold ? 700 : 500,
                                                                color: isBold ? row.color : '#3F4450',
                                                                position: 'sticky',
                                                                left: 0,
                                                                background: isBold ? `${row.color}08` : '#FFFFFF',
                                                                zIndex: 1,
                                                                borderRight: '1px solid #E2E4E9',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            {isBold && <span style={{ marginRight: 6 }}>▸</span>}
                                                            {row.account}
                                                        </td>

                                                        {/* Monthly values */}
                                                        {row.values.map((val, colIndex) => (
                                                            <td
                                                                key={colIndex}
                                                                style={{
                                                                    padding: '13px 16px',
                                                                    textAlign: 'right',
                                                                    fontSize: 13,
                                                                    fontWeight: isBold ? 700 : 400,
                                                                    color: val === null ? '#D0D3DC' : (isBold ? row.color : (val < 0 ? '#FA4338' : '#3F4450')),
                                                                    fontVariantNumeric: 'tabular-nums',
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                            >
                                                                {val === null || val === 0 ? (val === 0 ? <span style={{ color: '#D0D3DC' }}>—</span> : '—') : formatCurrency(val)}
                                                            </td>
                                                        ))}

                                                        {/* Total */}
                                                        <td
                                                            style={{
                                                                padding: '13px 20px',
                                                                textAlign: 'right',
                                                                fontSize: 13,
                                                                fontWeight: 700,
                                                                color: isBold ? row.color : (row.total < 0 ? '#FA4338' : row.color),
                                                                fontVariantNumeric: 'tabular-nums',
                                                                borderLeft: '2px solid #E2E4E9',
                                                                background: isBold ? `${row.color}12` : accentBg,
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            {formatCurrency(row.total)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Section footnote */}
                                <div
                                    className="px-6 py-3 text-xs"
                                    style={{ borderTop: '1px solid #E2E4E9', color: '#A4A9B6', background: '#FAFAFA' }}
                                >
                                    {section.type === 'balance_sheet'
                                        ? 'Balance sheet values are cumulative running totals as of the end of each period across all history, not just the selected period.'
                                        : 'P&L values reflect activity within each period only.'}
                                </div>
                            </div>
                        );
                    })}


                    {/* ── Quarterly P&L Impact ── */}
                    {quarterlyPL && quarterlyPL.quarters.length > 0 && (
                        <div className="glass-card" style={{ overflow: 'hidden' }}>
                            <div
                                className="flex items-center justify-between px-6 py-4"
                                style={{ borderBottom: '1px solid #E2E4E9', background: '#FAFAFA' }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#FFF4E6' }}>
                                        <DollarSign className="w-4 h-4" style={{ color: '#F5A623' }} />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-bold" style={{ color: '#3F4450' }}>Quarterly P&L Impact</h2>
                                        <p className="text-xs" style={{ color: '#A4A9B6' }}>How capitalization decisions affect P&L each quarter</p>
                                    </div>
                                </div>
                            </div>

                            {/* KPI Row */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-5" style={{ borderBottom: '1px solid #E2E4E9' }}>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Total P&L Charge</p>
                                    <p className="text-lg font-black" style={{ color: '#FA4338' }}>{formatCurrency(quarterlyPL.totals.totalPLCharge)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>R&D Expense</p>
                                    <p className="text-lg font-black" style={{ color: '#4141A2' }}>{formatCurrency(quarterlyPL.totals.rdExpense)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Amort. Expense</p>
                                    <p className="text-lg font-black" style={{ color: '#F5A623' }}>{formatCurrency(quarterlyPL.totals.amortExpense)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>P&L Benefit (Capitalized)</p>
                                    <p className="text-lg font-black" style={{ color: '#21944E' }}>{formatCurrency(quarterlyPL.totals.plBenefit)}</p>
                                    <p className="text-[10px]" style={{ color: '#A4A9B6' }}>Deferred to balance sheet</p>
                                </div>
                            </div>

                            {/* Chart */}
                            <div className="px-6 py-5" style={{ borderBottom: '1px solid #E2E4E9' }}>
                                <ResponsiveContainer width="100%" height={320}>
                                    <BarChart data={quarterlyPL.quarters} margin={{ top: 10, right: 10, bottom: 0, left: 0 }} barCategoryGap="25%">
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11, fill: '#3F4450', fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                            dy={10}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fill: '#A4A9B6', fontWeight: 600 }}
                                            tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toLocaleString()}k` : `$${v.toLocaleString()}`}
                                            axisLine={false}
                                            tickLine={false}
                                            dx={-10}
                                        />
                                        <Tooltip
                                            contentStyle={{ background: '#fff', border: '1px solid #E2E4E9', borderRadius: 10, padding: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
                                            formatter={(value: number | undefined, name: string | undefined) => {
                                                const v = value ?? 0;
                                                return [formatCurrency(v), name ?? ''];
                                            }}
                                            labelStyle={{ fontWeight: 700, color: '#3F4450', fontSize: 12 }}
                                            cursor={{ fill: 'rgba(238, 240, 244, 0.4)' }}
                                        />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 16 }} />
                                        <Bar dataKey="rdExpense" name="R&D Expense" fill="#4141A2" barSize={28} radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="amortExpense" name="Amortization" fill="#F5A623" barSize={28} radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="capitalized" name="Capitalized (Deferred)" fill="#21944E" barSize={28} radius={[4, 4, 0, 0]} fillOpacity={0.7} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Summary Table */}
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                                    <thead>
                                        <tr style={{ background: '#F6F6F9', borderBottom: '2px solid #E2E4E9' }}>
                                            <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quarter</th>
                                            <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#4141A2', textTransform: 'uppercase', letterSpacing: '0.04em' }}>R&D Expense</th>
                                            <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#F5A623', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amortization</th>
                                            <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#FA4338', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total P&L</th>
                                            <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#21944E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Capitalized</th>
                                            <th style={{ padding: '10px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#717684', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Without Cap</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {quarterlyPL.quarters.map((q: any) => (
                                            <tr key={q.label} style={{ borderBottom: '1px solid #F0F0F5' }}>
                                                <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 700, color: '#3F4450' }}>{q.label}</td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#4141A2', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(q.rdExpense)}</td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#F5A623', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(q.amortExpense)}</td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#FA4338', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(q.totalPLCharge)}</td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#21944E', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(q.capitalized)}</td>
                                                <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 13, color: '#717684', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(q.withoutCap)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ background: '#F6F6F9', borderTop: '2px solid #E2E4E9' }}>
                                            <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 800, color: '#3F4450' }}>TOTAL</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#4141A2', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(quarterlyPL.totals.rdExpense)}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#F5A623', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(quarterlyPL.totals.amortExpense)}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#FA4338', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(quarterlyPL.totals.totalPLCharge)}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#21944E', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(quarterlyPL.totals.capitalized)}</td>
                                            <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#717684', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(quarterlyPL.totals.withoutCap)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <div className="px-6 py-3 text-xs" style={{ borderTop: '1px solid #E2E4E9', color: '#A4A9B6', background: '#FAFAFA' }}>
                                R&D Expense = labor costs expensed (non-capitalizable). Amortization = straight-line amortization of previously capitalized costs. Capitalized = labor costs deferred to the balance sheet. Without Cap = total cost if nothing had been capitalized.
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
