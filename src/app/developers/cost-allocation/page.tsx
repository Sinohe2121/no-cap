'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, DollarSign, ChevronDown, ChevronRight, X, Filter } from 'lucide-react';

interface DevInfo {
    id: string;
    name: string;
    salary: number;
    fringe: number;
    sbc: number;
    loadedCost: number;
}

interface TicketAllocation {
    pct: number;
    amount: number;
}

interface TicketRow {
    id: string;
    ticketId: string;
    summary: string;
    projectName: string;
    isCapitalizable: boolean;
    assigneeName: string;
    assigneeId: string | null;
    storyPoints: number;
    resolutionDate: string | null;
    allocations: Record<string, TicketAllocation>;
}

interface PeriodData {
    label: string;
    payDate: string;
    developers: DevInfo[];
    tickets: TicketRow[];
    devTotals: Record<string, number>;
    totalAllocated: number;
    totalLoadedCost: number;
    unallocated: number;
}

interface MatrixData {
    periods: PeriodData[];
    globalFringeRate: number;
}

function formatCurrency(amount: number) {
    if (!amount || amount === 0) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatPct(pct: number) {
    if (!pct || pct === 0) return '';
    return `${(pct * 100).toFixed(1)}%`;
}

function firstName(fullName: string) {
    return fullName.split(',')[0]?.trim().split(' ').pop() || fullName;
}

export default function CostAllocationPage() {
    const [data, setData] = useState<MatrixData | null>(null);
    const [loading, setLoading] = useState(true);
    const [collapsedPeriods, setCollapsedPeriods] = useState<Set<string>>(new Set());
    const [assigneeFilter, setAssigneeFilter] = useState<Record<string, string | null>>({});

    const getFilteredTickets = (period: PeriodData) => {
        const filterId = assigneeFilter[period.label];
        if (!filterId) return period.tickets;
        return period.tickets.filter(t => {
            // Show tickets where the filtered developer has a non-zero allocation
            const alloc = t.allocations[filterId];
            return alloc && alloc.amount > 0;
        });
    };

    const getFilterDevName = (period: PeriodData, id: string) => {
        const dev = period.developers.find(d => d.id === id);
        return dev ? dev.name.split(',').reverse().join(' ').trim() : id;
    };

    useEffect(() => {
        fetch('/api/cost-allocation/ticket-matrix')
            .then(res => res.json())
            .then(setData)
            .finally(() => setLoading(false));
    }, []);

    const togglePeriod = (label: string) => {
        setCollapsedPeriods(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!data || data.periods.length === 0) {
        return (
            <div>
                <div className="mb-4">
                    <Link href="/developers" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to FTE & Payroll
                    </Link>
                </div>
                <div className="glass-card p-12 text-center">
                    <DollarSign className="w-12 h-12 mx-auto mb-4" style={{ color: '#A4A9B6' }} />
                    <h2 className="text-lg font-semibold mb-2" style={{ color: '#3F4450' }}>No Cost Allocation Data</h2>
                    <p className="text-sm" style={{ color: '#A4A9B6' }}>Import payroll periods first to see ticket-level cost allocations.</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-4">
                <Link href="/developers" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to FTE & Payroll
                </Link>
            </div>

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-header">Ticket-Level Cost Allocation</h1>
                    <p className="section-subtext">Story point–based allocation of fully loaded developer costs to individual tickets</p>
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: '#A4A9B6' }}>
                    <DollarSign className="w-4 h-4" />
                    <span>{data.periods.length} period{data.periods.length > 1 ? 's' : ''}</span>
                </div>
            </div>

            <div className="flex flex-col gap-6">
                {data.periods.map((period) => {
                    const isCollapsed = collapsedPeriods.has(period.label);
                    const devs = period.developers;
                    const activeFilter = assigneeFilter[period.label];
                    const filteredTickets = getFilteredTickets(period);

                    return (
                        <div key={period.label} className="glass-card overflow-hidden">
                            {/* Period header */}
                            <button
                                onClick={() => togglePeriod(period.label)}
                                className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
                                style={{ background: 'transparent' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFBFC')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                                <div className="flex items-center gap-3">
                                    {isCollapsed
                                        ? <ChevronRight className="w-4 h-4" style={{ color: '#A4A9B6' }} />
                                        : <ChevronDown className="w-4 h-4" style={{ color: '#4141A2' }} />
                                    }
                                    <span className="text-sm font-bold" style={{ color: '#3F4450' }}>{period.label}</span>
                                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: '#F0EAF8', color: '#4141A2' }}>
                                        {period.tickets.length} tickets
                                    </span>
                                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: '#EBF5EF', color: '#21944E' }}>
                                        {devs.length} developers
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs" style={{ color: '#A4A9B6' }}>
                                    {activeFilter && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setAssigneeFilter(prev => ({ ...prev, [period.label]: null })); }}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors"
                                            style={{ background: '#F0EAF8', color: '#4141A2', border: '1px solid #E0DDF7', cursor: 'pointer' }}
                                            title="Clear filter"
                                        >
                                            <Filter className="w-3 h-3" />
                                            {getFilterDevName(period, activeFilter)}
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                    <span>Allocated: <strong style={{ color: '#4141A2' }}>{formatCurrency(period.totalAllocated)}</strong></span>
                                    <span>Total Loaded: <strong style={{ color: '#3F4450' }}>{formatCurrency(period.totalLoadedCost)}</strong></span>
                                </div>
                            </button>

                            {/* Table */}
                            {!isCollapsed && (
                                <div style={{ overflowX: 'auto', borderTop: '1px solid #E2E4E9' }}>
                                    <table className="w-full border-collapse text-[11px]" style={{ minWidth: 600 + devs.length * 160 }}>
                                        {/* Super header: developer names spanning 2 cols each */}
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #E2E4E9' }}>
                                                <th className="sticky left-0 z-10 px-3 py-2" style={{ background: '#FFF', minWidth: 90 }} />
                                                <th className="px-3 py-2" style={{ minWidth: 160 }} />
                                                <th className="px-3 py-2" style={{ minWidth: 110 }} />
                                                <th className="px-3 py-2 text-center" style={{ minWidth: 40 }} />
                                                {devs.map((d) => {
                                                    const isActive = activeFilter === d.id;
                                                    return (
                                                        <th
                                                            key={d.id}
                                                            colSpan={2}
                                                            className="px-2 py-2 text-center font-bold whitespace-nowrap"
                                                            style={{
                                                                color: isActive ? '#fff' : '#3F4450',
                                                                borderLeft: '2px solid #E2E4E9',
                                                                fontSize: 11,
                                                                background: isActive ? '#4141A2' : 'transparent',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s ease',
                                                            }}
                                                            onClick={() => setAssigneeFilter(prev => ({
                                                                ...prev,
                                                                [period.label]: prev[period.label] === d.id ? null : d.id,
                                                            }))}
                                                            title={`Filter tickets by ${d.name.split(',').reverse().join(' ').trim()}`}
                                                        >
                                                            <div>{d.name.split(',').reverse().join(' ').trim()}</div>
                                                            <div className="text-[9px] font-medium" style={{ color: isActive ? 'rgba(255,255,255,0.7)' : '#A4A9B6' }}>
                                                                {formatCurrency(d.loadedCost)} loaded
                                                            </div>
                                                        </th>
                                                    );
                                                })}
                                                <th className="px-3 py-2 text-right font-bold" style={{ color: '#3F4450', borderLeft: '2px solid #4141A2', minWidth: 90 }}>
                                                    Total
                                                </th>
                                            </tr>
                                            {/* Sub-header row */}
                                            <tr style={{ borderBottom: '2px solid #E2E4E9', background: '#FAFBFC' }}>
                                                <th className="sticky left-0 z-10 px-3 py-1.5 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', background: '#FAFBFC', fontSize: 9 }}>Ticket</th>
                                                <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Project</th>
                                                <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Assignee</th>
                                                <th className="px-3 py-1.5 text-center font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>SP</th>
                                                {devs.map((d) => (
                                                    <th key={`${d.id}-hdr`} colSpan={2} style={{ borderLeft: '2px solid #E2E4E9' }}>
                                                        <div className="flex">
                                                            <span className="flex-1 px-2 py-1.5 text-center font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>%</span>
                                                            <span className="flex-1 px-2 py-1.5 text-center font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9, borderLeft: '1px solid #E2E4E9' }}>$</span>
                                                        </div>
                                                    </th>
                                                ))}
                                                <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', borderLeft: '2px solid #4141A2', fontSize: 9 }}>Allocated</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTickets.map((ticket) => {
                                                const totalAllocated = Object.values(ticket.allocations).reduce((s, a) => s + a.amount, 0);
                                                return (
                                                    <tr
                                                        key={ticket.id}
                                                        className="transition-colors"
                                                        style={{ borderBottom: '1px solid #F0F0F4' }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFBFC')}
                                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        <td className="sticky left-0 z-10 px-3 py-2 font-mono font-medium whitespace-nowrap" style={{ color: '#4141A2', background: '#FFFFFF' }}>
                                                            {ticket.ticketId}
                                                        </td>
                                                        <td className="px-3 py-2 truncate max-w-[160px]" style={{ color: '#3F4450' }} title={ticket.projectName}>
                                                            <span className="font-medium">{ticket.projectName}</span>
                                                            {ticket.isCapitalizable && (
                                                                <span className="ml-1 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: '#EBF5EF', color: '#21944E' }}>CAP</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: '#717684' }}>{ticket.assigneeName}</td>
                                                        <td className="px-3 py-2 text-center font-semibold tabular-nums" style={{ color: '#3F4450' }}>{ticket.storyPoints}</td>
                                                        {devs.map((d) => {
                                                            const alloc = ticket.allocations[d.id];
                                                            return (
                                                                <td key={d.id} colSpan={2} style={{ borderLeft: '2px solid #E2E4E9' }}>
                                                                    {alloc ? (
                                                                        <div className="flex">
                                                                            <span className="flex-1 px-2 py-2 text-center tabular-nums font-medium" style={{ color: '#4141A2' }}>
                                                                                {formatPct(alloc.pct)}
                                                                            </span>
                                                                            <span className="flex-1 px-2 py-2 text-right tabular-nums font-semibold" style={{ color: '#3F4450', borderLeft: '1px solid #F0F0F4' }}>
                                                                                {formatCurrency(alloc.amount)}
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex">
                                                                            <span className="flex-1 px-2 py-2 text-center" style={{ color: '#E2E4E9' }}>—</span>
                                                                            <span className="flex-1 px-2 py-2 text-right" style={{ color: '#E2E4E9', borderLeft: '1px solid #F0F0F4' }}>—</span>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: totalAllocated > 0 ? '#4141A2' : '#A4A9B6', borderLeft: '2px solid #4141A2' }}>
                                                            {totalAllocated > 0 ? formatCurrency(totalAllocated) : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        {/* Footer totals */}
                                        <tfoot>
                                            <tr style={{ borderTop: '2px solid #E2E4E9', background: '#FAFBFC' }}>
                                                <td colSpan={4} className="sticky left-0 z-10 px-3 py-3 font-bold" style={{ color: '#3F4450', background: '#FAFBFC' }}>
                                                    Total
                                                </td>
                                                {devs.map((d) => {
                                                    const devTotal = period.devTotals[d.id] || 0;
                                                    return (
                                                        <td key={d.id} colSpan={2} className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: devTotal > 0 ? '#3F4450' : '#A4A9B6', borderLeft: '2px solid #E2E4E9' }}>
                                                            {devTotal > 0 ? formatCurrency(devTotal) : '—'}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: '#4141A2', borderLeft: '2px solid #4141A2' }}>
                                                    {formatCurrency(period.totalAllocated)}
                                                </td>
                                            </tr>
                                            {period.unallocated > 0 && (
                                                <tr style={{ borderTop: '1px solid #E2E4E9' }}>
                                                    <td colSpan={4 + devs.length * 2} className="px-3 py-2 text-xs italic" style={{ color: '#A4A9B6' }}>
                                                        Unallocated cost (developers with no tickets this period): {formatCurrency(period.unallocated)}
                                                    </td>
                                                    <td />
                                                </tr>
                                            )}
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
