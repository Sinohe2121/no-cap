'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Printer, RefreshCw, TrendingUp, TrendingDown, Minus, CalendarRange } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────── */
interface RollForwardRow {
    project: {
        id: string;
        name: string;
        status: string;
        isCapitalizable: boolean;
        amortizationMonths: number;
        launchDate: string | null;
    };
    beginningGross: number;
    beginningAccumAmort: number;
    beginningNBV: number;
    periodCapitalized: number;
    periodAmortized: number;
    endingGross: number;
    endingAccumAmort: number;
    endingNBV: number;
}

interface Totals {
    beginningGross: number;
    beginningAccumAmort: number;
    beginningNBV: number;
    periodCapitalized: number;
    periodAmortized: number;
    endingGross: number;
    endingAccumAmort: number;
    endingNBV: number;
}

interface RollForwardData {
    projects: RollForwardRow[];
    totals: Totals;
    periodLabel: string;
    periodStart: string;
    periodEnd: string;
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/* ─── Component ─────────────────────────────────────────────────── */
interface PeriodOption {
    id: string;
    month: number;
    year: number;
    label: string;
    value: string; // "YYYY-MM" sortable key
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INCEPTION = '__inception__';

export default function RollForwardPage() {
    const [data, setData] = useState<RollForwardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [periods, setPeriods] = useState<PeriodOption[]>([]);
    const [startPeriod, setStartPeriod] = useState<string>(INCEPTION);
    const [endPeriod, setEndPeriod] = useState<string>('');

    // Fetch available periods on mount
    useEffect(() => {
        fetch('/api/accounting/periods')
            .then(r => r.ok ? r.json() : [])
            .then((raw: unknown) => {
                const list: Array<{ id: string; month: number; year: number }> =
                    Array.isArray(raw) ? raw : (raw as any)?.periods ?? [];
                const opts: PeriodOption[] = list.map(p => ({
                    ...p,
                    label: `${MONTHS[p.month - 1]} ${p.year}`,
                    value: `${p.year}-${String(p.month).padStart(2, '0')}`,
                }));
                setPeriods(opts);
                // Default: start = inception, end = latest period
                if (opts.length > 0) {
                    setEndPeriod(opts[opts.length - 1].value);
                } else {
                    // No periods with entries — stop loading
                    setLoading(false);
                }
            })
            .catch(() => setLoading(false));
    }, []);

    // Fetch roll-forward data when period selection changes
    useEffect(() => {
        if (!endPeriod) return;
        setLoading(true);

        let startDate: string;
        let endDate: string;

        if (startPeriod === INCEPTION) {
            startDate = '2000-01-01';
        } else {
            const [y, m] = startPeriod.split('-').map(Number);
            startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        }

        // End date = last day of the selected end month
        const [ey, em] = endPeriod.split('-').map(Number);
        const lastDay = new Date(ey, em, 0).getDate();
        endDate = `${ey}-${String(em).padStart(2, '0')}-${lastDay}`;

        fetch(`/api/accounting/roll-forward?start=${startDate}&end=${endDate}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [startPeriod, endPeriod]);

    const handleExportCSV = () => {
        if (!data) return;
        const headers = ['Project', 'Status', 'Useful Life', 'Beg. Gross', 'Beg. Accum Amort', 'Beg. NBV', 'Additions', 'Amortization', 'End. Gross', 'End. Accum Amort', 'End. NBV'];
        const rows = data.projects.map(r => [
            `"${r.project.name}"`, r.project.status, `${r.project.amortizationMonths}m`,
            r.beginningGross.toFixed(2), r.beginningAccumAmort.toFixed(2), r.beginningNBV.toFixed(2),
            r.periodCapitalized.toFixed(2), r.periodAmortized.toFixed(2),
            r.endingGross.toFixed(2), r.endingAccumAmort.toFixed(2), r.endingNBV.toFixed(2),
        ]);
        rows.push([
            'TOTAL', '', '',
            data.totals.beginningGross.toFixed(2), data.totals.beginningAccumAmort.toFixed(2), data.totals.beginningNBV.toFixed(2),
            data.totals.periodCapitalized.toFixed(2), data.totals.periodAmortized.toFixed(2),
            data.totals.endingGross.toFixed(2), data.totals.endingAccumAmort.toFixed(2), data.totals.endingNBV.toFixed(2),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roll-forward-schedule.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!data || data.projects.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <RefreshCw className="w-10 h-10" style={{ color: '#A4A9B6' }} />
                <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>No capitalized projects found</p>
                <p className="text-xs" style={{ color: '#A4A9B6' }}>Import projects and generate journal entries to see the roll-forward schedule.</p>
                <Link href="/accounting/journal-entries" className="btn-accent text-sm mt-2">Go to Journal Entries</Link>
            </div>
        );
    }

    const { projects: rows, totals: t, periodStart, periodEnd } = data;

    // Build readable labels
    const nbvChange = t.endingNBV - t.beginningNBV;
    const startLabel = periodStart ? fmtDate(periodStart) : '';
    const endLabel = periodEnd ? fmtDate(periodEnd) : '';
    const selectedStartLabel = startPeriod === INCEPTION
        ? 'Inception'
        : periods.find(p => p.value === startPeriod)?.label || startPeriod;
    const selectedEndLabel = periods.find(p => p.value === endPeriod)?.label || endPeriod;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <Link href="/accounting" className="flex items-center gap-1 text-xs font-semibold mb-2 no-underline" style={{ color: 'var(--gem)' }}>
                        <ArrowLeft className="w-3 h-3" /> Accounting Hub
                    </Link>
                    <h1 className="section-header flex items-center gap-2">
                        <RefreshCw className="w-5 h-5" style={{ color: 'var(--gem)' }} />
                        Roll-Forward Schedule
                    </h1>
                    <p className="section-subtext">Capitalized software asset roll-forward</p>
                </div>
                <div className="flex items-center gap-3 print:hidden">
                    <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 text-sm">
                        <Printer className="w-4 h-4" /> Print
                    </button>
                    <button onClick={handleExportCSV} className="btn-accent flex items-center gap-2 text-sm">
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>
            </div>

            {/* ── Period Selector Bar ── */}
            <div className="glass-card p-4 mb-6 flex items-center gap-6 flex-wrap print:hidden" style={{ background: '#FAFBFC' }}>
                <div className="flex items-center gap-2">
                    <CalendarRange className="w-4 h-4" style={{ color: 'var(--gem)' }} />
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#717684' }}>Report Period</span>
                </div>

                <div className="flex items-center gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>From</span>
                        <select
                            value={startPeriod}
                            onChange={e => setStartPeriod(e.target.value)}
                            style={{
                                padding: '6px 28px 6px 10px',
                                border: '1.5px solid #D4D4F0',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#3F4450',
                                background: '#fff',
                                cursor: 'pointer',
                                outline: 'none',
                                appearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23717684' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 8px center',
                            }}
                        >
                            <option value={INCEPTION}>Inception</option>
                            {periods.map(p => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                    </label>

                    <span className="text-sm font-semibold mt-4" style={{ color: '#A4A9B6' }}>→</span>

                    <label className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>To</span>
                        <select
                            value={endPeriod}
                            onChange={e => setEndPeriod(e.target.value)}
                            style={{
                                padding: '6px 28px 6px 10px',
                                border: '1.5px solid #D4D4F0',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#3F4450',
                                background: '#fff',
                                cursor: 'pointer',
                                outline: 'none',
                                appearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23717684' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 8px center',
                            }}
                        >
                            {periods.map(p => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                    </label>
                </div>

                {loading && (
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ml-2" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
                )}

                <div className="ml-auto flex items-center gap-2 text-[11px] font-semibold" style={{ color: '#4141A2' }}>
                    <span style={{ background: 'rgba(65,65,162,0.08)', padding: '4px 10px', borderRadius: 6 }}>
                        {selectedStartLabel} → {selectedEndLabel}
                    </span>
                </div>
            </div>

            {/* ── Summary KPIs ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <SummaryCard label="Beginning NBV" value={fmt(t.beginningNBV)} color="var(--gem)" subtitle={startLabel ? `As of ${startLabel}` : undefined} />
                <SummaryCard label="Period Additions" value={fmt(t.periodCapitalized)} color="var(--cilantro)" icon={<TrendingUp className="w-3.5 h-3.5" />} />
                <SummaryCard label="Period Amortization" value={`(${fmt(t.periodAmortized)})`} color="var(--envoy-red)" icon={<TrendingDown className="w-3.5 h-3.5" />} />
                <SummaryCard label="Ending NBV" value={fmt(t.endingNBV)} color="var(--gem)" subtitle={endLabel ? `As of ${endLabel} · ${nbvChange >= 0 ? '+' : ''}${fmt(nbvChange)} change` : `${nbvChange >= 0 ? '+' : ''}${fmt(nbvChange)} change`} />
            </div>

            {/* ── Schedule Table ── */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: 900 }}>
                        <thead>
                            {/* Super-header: date group labels */}
                            <tr style={{ background: '#F5F5FA' }}>
                                <th colSpan={3} className="px-5 py-2" style={{ borderBottom: '1px solid #E2E4E9' }} />
                                <th colSpan={3} className="px-3 py-2 text-center text-[9px] font-extrabold uppercase tracking-widest" style={{ color: '#4141A2', borderBottom: '1px solid #D4D4F0', background: 'rgba(65,65,162,0.05)' }}>
                                    {startLabel ? `As of ${startLabel}` : 'Beginning'}
                                </th>
                                <th colSpan={2} className="px-3 py-2 text-center text-[9px] font-extrabold uppercase tracking-widest" style={{ color: '#3F4450', borderBottom: '1px solid #E2E4E9' }}>
                                    {startLabel && endLabel ? `${startLabel} – ${endLabel}` : 'Period Activity'}
                                </th>
                                <th colSpan={3} className="px-3 py-2 text-center text-[9px] font-extrabold uppercase tracking-widest" style={{ color: '#3F4450', borderBottom: '1px solid #E2E4E9', background: 'rgba(63,68,80,0.03)' }}>
                                    {endLabel ? `As of ${endLabel}` : 'Ending'}
                                </th>
                            </tr>
                            {/* Column labels */}
                            <tr style={{ background: '#FAFBFC' }}>
                                <th className="text-left px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#717684', borderBottom: '2px solid #E2E4E9' }}>Project</th>
                                <th className="text-center px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#717684', borderBottom: '2px solid #E2E4E9' }}>Status</th>
                                <th className="text-center px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#717684', borderBottom: '2px solid #E2E4E9' }}>Life</th>
                                <th className="text-right px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#4141A2', borderBottom: '2px solid #D4D4F0', background: 'rgba(65,65,162,0.03)' }}>Gross</th>
                                <th className="text-right px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#4141A2', borderBottom: '2px solid #D4D4F0', background: 'rgba(65,65,162,0.03)' }}>Accum Amort</th>
                                <th className="text-right px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#4141A2', borderBottom: '2px solid #D4D4F0', background: 'rgba(65,65,162,0.03)' }}>NBV</th>
                                <th className="text-right px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#21944E', borderBottom: '2px solid #C8E6D0', background: 'rgba(33,148,78,0.03)' }}>Additions</th>
                                <th className="text-right px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#FA4338', borderBottom: '2px solid #FFDDD9', background: 'rgba(250,67,56,0.03)' }}>Amort.</th>
                                <th className="text-right px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3F4450', borderBottom: '2px solid #E2E4E9', background: 'rgba(63,68,80,0.03)' }}>Gross</th>
                                <th className="text-right px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3F4450', borderBottom: '2px solid #E2E4E9', background: 'rgba(63,68,80,0.03)' }}>Accum Amort</th>
                                <th className="text-right px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3F4450', borderBottom: '2px solid #E2E4E9', background: 'rgba(63,68,80,0.03)' }}>NBV</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const statusColors: Record<string, { bg: string; fg: string }> = {
                                    PLANNING: { bg: 'var(--tint-info)', fg: 'var(--slate)' },
                                    DEV: { bg: 'var(--tint-accent)', fg: 'var(--gem)' },
                                    LIVE: { bg: 'var(--tint-success)', fg: '#21944E' },
                                    RETIRED: { bg: 'var(--tint-warning)', fg: 'var(--amber)' },
                                };
                                const sc = statusColors[r.project.status] || statusColors.PLANNING;

                                return (
                                    <tr key={r.project.id} style={{ borderBottom: '1px solid #F0F0F5' }}>
                                        <td className="px-5 py-3">
                                            <Link href={`/projects/${r.project.id}`} className="text-xs font-semibold no-underline" style={{ color: '#3F4450' }}>
                                                {r.project.name}
                                            </Link>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className="badge text-[9px]" style={{ background: sc.bg, color: sc.fg }}>{r.project.status}</span>
                                        </td>
                                        <td className="px-3 py-3 text-center text-[11px]" style={{ color: '#A4A9B6' }}>{r.project.amortizationMonths}m</td>
                                        <td className="px-3 py-3 text-right text-xs" style={{ color: '#4141A2', background: 'rgba(65,65,162,0.015)' }}>{fmt(r.beginningGross)}</td>
                                        <td className="px-3 py-3 text-right text-xs" style={{ color: '#4141A2', background: 'rgba(65,65,162,0.015)' }}>({fmt(r.beginningAccumAmort)})</td>
                                        <td className="px-3 py-3 text-right text-xs font-semibold" style={{ color: '#4141A2', background: 'rgba(65,65,162,0.015)' }}>{fmt(r.beginningNBV)}</td>
                                        <td className="px-3 py-3 text-right text-xs font-semibold" style={{ color: r.periodCapitalized > 0 ? '#21944E' : '#A4A9B6', background: 'rgba(33,148,78,0.015)' }}>
                                            {r.periodCapitalized > 0 ? fmt(r.periodCapitalized) : '—'}
                                        </td>
                                        <td className="px-3 py-3 text-right text-xs font-semibold" style={{ color: r.periodAmortized > 0 ? '#FA4338' : '#A4A9B6', background: 'rgba(250,67,56,0.015)' }}>
                                            {r.periodAmortized > 0 ? `(${fmt(r.periodAmortized)})` : '—'}
                                        </td>
                                        <td className="px-3 py-3 text-right text-xs" style={{ color: '#3F4450', background: 'rgba(63,68,80,0.015)' }}>{fmt(r.endingGross)}</td>
                                        <td className="px-3 py-3 text-right text-xs" style={{ color: '#3F4450', background: 'rgba(63,68,80,0.015)' }}>({fmt(r.endingAccumAmort)})</td>
                                        <td className="px-5 py-3 text-right text-xs font-bold" style={{ color: '#3F4450', background: 'rgba(63,68,80,0.015)' }}>{fmt(r.endingNBV)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: '#FAFBFC', borderTop: '2px solid #E2E4E9' }}>
                                <td className="px-5 py-3.5 text-xs font-bold" style={{ color: '#3F4450' }}>TOTAL</td>
                                <td colSpan={2}></td>
                                <td className="px-3 py-3.5 text-right text-xs font-bold" style={{ color: '#4141A2' }}>{fmt(t.beginningGross)}</td>
                                <td className="px-3 py-3.5 text-right text-xs font-bold" style={{ color: '#4141A2' }}>({fmt(t.beginningAccumAmort)})</td>
                                <td className="px-3 py-3.5 text-right text-xs font-bold" style={{ color: '#4141A2' }}>{fmt(t.beginningNBV)}</td>
                                <td className="px-3 py-3.5 text-right text-xs font-bold" style={{ color: '#21944E' }}>{fmt(t.periodCapitalized)}</td>
                                <td className="px-3 py-3.5 text-right text-xs font-bold" style={{ color: '#FA4338' }}>({fmt(t.periodAmortized)})</td>
                                <td className="px-3 py-3.5 text-right text-xs font-bold" style={{ color: '#3F4450' }}>{fmt(t.endingGross)}</td>
                                <td className="px-3 py-3.5 text-right text-xs font-bold" style={{ color: '#3F4450' }}>({fmt(t.endingAccumAmort)})</td>
                                <td className="px-5 py-3.5 text-right text-sm font-black" style={{ color: '#3F4450' }}>{fmt(t.endingNBV)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Footnote */}
                <div className="px-5 py-4 border-t flex items-center gap-6 text-[10px]" style={{ borderColor: '#E2E4E9', color: '#A4A9B6' }}>
                    <span>Gross = Capitalized cost (inception to date)</span>
                    <span>Accum Amort = Accumulated amortization (straight-line)</span>
                    <span>NBV = Net Book Value (Gross − Accum Amort)</span>
                    <span>Additions = Period capitalization journal entries</span>
                </div>
            </div>
        </div>
    );
}

/* ─── Summary Card ──────────────────────────────────────────────── */
function SummaryCard({ label, value, color, subtitle, icon }: { label: string; value: string; color: string; subtitle?: string; icon?: React.ReactNode }) {
    return (
        <div className="glass-card p-4 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                {icon && <div style={{ color }}>{icon}</div>}
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>{label}</span>
            </div>
            <span className="text-xl font-bold" style={{ color: '#3F4450' }}>{value}</span>
            {subtitle && <span className="text-[11px]" style={{ color: '#A4A9B6' }}>{subtitle}</span>}
        </div>
    );
}
