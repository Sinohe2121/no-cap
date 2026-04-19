'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Calendar, CheckSquare, Download, AlertCircle, Filter, ChevronLeft, ChevronRight, Users, Info } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function getLastDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

function getMonthLabel(month: number): string {
    return MONTH_NAMES[month - 1] || '';
}

interface PayrollPeriod {
    id: string;
    label: string;
    payDate: string;
    year: number;
}

export default function ImportPeriodPage() {
    const router = useRouter();
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(0); // 1-12, 0 = not selected
    const [rosterOnly, setRosterOnly] = useState(true);
    const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
    const [loadingPeriods, setLoadingPeriods] = useState(true);

    const [previewing, setPreviewing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewTickets, setPreviewTickets] = useState<any[]>([]);
    const [customFieldsConfig, setCustomFieldsConfig] = useState<{ id: string, name: string }[]>([]);
    const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
    const [hasPreviewed, setHasPreviewed] = useState(false);

    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
    const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);

    // Load available payroll periods
    useEffect(() => {
        setLoadingPeriods(true);
        fetch('/api/payroll-register/periods')
            .then(r => r.ok ? r.json() : [])
            .then((data: PayrollPeriod[]) => {
                setPayrollPeriods(Array.isArray(data) ? data : []);
            })
            .finally(() => setLoadingPeriods(false));
    }, []);

    // Which months have payroll data for the selected year
    const availableMonths = useMemo(() => {
        const months = new Set<number>();
        payrollPeriods.forEach(p => {
            // Parse ISO date string directly to avoid timezone issues
            const parts = String(p.payDate).split('T')[0].split('-');
            const pYear = parseInt(parts[0], 10);
            const pMonth = parseInt(parts[1], 10);
            if (pYear === year) {
                months.add(pMonth); // 1-indexed
            }
        });
        return months;
    }, [payrollPeriods, year]);

    // Available years from payroll data
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        payrollPeriods.forEach(p => {
            const parts = String(p.payDate).split('T')[0].split('-');
            years.add(parseInt(parts[0], 10));
        });
        return years;
    }, [payrollPeriods]);

    // Reset month when year changes if current month has no data
    useEffect(() => {
        if (month > 0 && !availableMonths.has(month)) {
            setMonth(0);
        }
    }, [year, availableMonths]);

    const hasSelection = month > 0;
    const startDate = hasSelection ? `${year}-${String(month).padStart(2, '0')}-01` : '';
    const endDate = hasSelection ? `${year}-${String(month).padStart(2, '0')}-${getLastDayOfMonth(year, month)}` : '';
    const depreciationStart = hasSelection
        ? (month === 12 ? `${getMonthLabel(1)} ${year + 1}` : `${getMonthLabel(month + 1)} ${year}`)
        : '';

    const filteredTickets = useMemo(() => {
        if (Object.keys(columnFilters).length === 0) return previewTickets;
        return previewTickets.filter(ticket => {
            for (const [colName, allowedValues] of Object.entries(columnFilters)) {
                const val = (ticket.customFields?.[colName] || '(Blank)').toString();
                if (!allowedValues.has(val)) return false;
            }
            return true;
        });
    }, [previewTickets, columnFilters]);

    const getUniqueValuesForCol = (colName: string): string[] => {
        const vals = new Set<string>();
        previewTickets.forEach(t => vals.add((t.customFields?.[colName] || '(Blank)').toString()));
        return Array.from(vals).sort();
    };

    const handleFilterToggle = (colName: string, val: string) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            const existingSet = next[colName] || new Set(getUniqueValuesForCol(colName));
            const newSet = new Set(existingSet);
            if (newSet.has(val)) {
                newSet.delete(val);
            } else {
                newSet.add(val);
            }
            if (newSet.size === getUniqueValuesForCol(colName).length) {
                delete next[colName];
            } else {
                next[colName] = newSet;
            }
            return next;
        });
    };

    const selectAllFilter = (colName: string) => {
        setColumnFilters(prev => { const next = { ...prev }; delete next[colName]; return next; });
    };

    const clearFilter = (colName: string) => {
        setColumnFilters(prev => { const next = { ...prev }; next[colName] = new Set(); return next; });
    };

    const handlePreview = async () => {
        if (!hasSelection) {
            setError('Please select a month with payroll data');
            return;
        }
        setError(null);
        setPreviewing(true);
        try {
            const res = await fetch('/api/integrations/jira/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate, endDate, rosterOnly, year, month }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to fetch preview');
            }
            const data = await res.json();
            setPreviewTickets(data.tickets);
            setCustomFieldsConfig(data.customFieldsConfig || []);
            const importable = data.tickets.filter((t: any) => t.importable);
            setSelectedTicketIds(new Set(importable.map((t: any) => t.ticketId)));
            setColumnFilters({});
            setHasPreviewed(true);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setPreviewing(false);
        }
    };

    const handleImport = async () => {
        if (selectedTicketIds.size === 0) {
            setError('Please select at least one ticket to import');
            return;
        }
        setError(null);
        // Only import tickets that are SELECTED and VISIBLE in the current filtered view
        const filteredIds = new Set(filteredTickets.map(t => t.ticketId));
        const ticketsToImport = previewTickets.filter(t => selectedTicketIds.has(t.ticketId) && filteredIds.has(t.ticketId));
        setImporting(true);
        try {
            const res = await fetch('/api/integrations/jira/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tickets: ticketsToImport, importPeriod: `${getMonthLabel(month)} ${year}` }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to import tickets');
            }
            router.push('/projects/details');
        } catch (e: any) {
            setError(e.message);
            setImporting(false);
        }
    };

    const toggleSelection = (ticketId: string) => {
        const next = new Set(selectedTicketIds);
        if (next.has(ticketId)) { next.delete(ticketId); } else { next.add(ticketId); }
        setSelectedTicketIds(next);
    };

    const selectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedTicketIds(new Set(filteredTickets.filter(t => t.importable).map(t => t.ticketId)));
        } else {
            setSelectedTicketIds(new Set());
        }
    };

    return (
        <div className="max-w-5xl mx-auto">
            <Link href="/projects/details" className="btn-ghost mb-6 inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Back to Project Details
            </Link>

            <div className="mb-8">
                <h1 className="section-header">Import Period from Jira</h1>
                <p className="section-subtext">Select a payroll period and import Jira tickets for capitalization.</p>
            </div>

            {/* Import Criteria Card */}
            <Card className="p-6 mb-6 border-2" style={{ borderColor: '#E2E4E9' }}>
                <h2 className="text-sm font-semibold mb-5 flex items-center gap-2" style={{ color: '#3F4450' }}>
                    <Calendar className="w-4 h-4" style={{ color: '#4141A2' }} /> Import Criteria
                </h2>

                <div className="flex flex-col md:flex-row items-start gap-6 mb-6">
                    {/* Year selector with chevrons */}
                    <div>
                        <label className="form-label">Year</label>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setYear(y => y - 1)}
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                style={{ color: '#3F4450' }}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span
                                className="text-lg font-bold tabular-nums px-3 py-1.5 rounded-lg min-w-[80px] text-center"
                                style={{ background: '#F6F6F9', color: '#3F4450' }}
                            >
                                {year}
                            </span>
                            <button
                                onClick={() => setYear(y => y + 1)}
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                style={{ color: '#3F4450' }}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        {!availableYears.has(year) && (
                            <p className="text-[10px] mt-1" style={{ color: '#FA4338' }}>No payroll data for {year}</p>
                        )}
                    </div>

                    {/* Month dropdown */}
                    <div className="flex-1 max-w-xs">
                        <label className="form-label">Month <span style={{ color: '#FA4338' }}>*</span></label>
                        <select
                            className="form-select w-full"
                            value={month}
                            onChange={e => setMonth(Number(e.target.value))}
                            style={{ minHeight: '42px' }}
                        >
                            <option value={0}>— Select Month —</option>
                            {MONTH_NAMES.map((name, i) => {
                                const m = i + 1;
                                const hasData = availableMonths.has(m);
                                return (
                                    <option key={m} value={m} disabled={!hasData}>
                                        {name}{!hasData ? ' (no payroll data)' : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                </div>

                {/* Roster-only toggle */}
                <div
                    className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all"
                    style={{
                        background: rosterOnly ? '#F0F0FA' : '#F6F6F9',
                        border: rosterOnly ? '1.5px solid #4141A2' : '1.5px solid #E2E4E9',
                    }}
                    onClick={() => setRosterOnly(!rosterOnly)}
                >
                    <div
                        className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                        style={{ background: rosterOnly ? '#4141A2' : '#E2E4E9' }}
                    >
                        <div
                            className="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: rosterOnly ? '24px' : '4px' }}
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5" style={{ color: rosterOnly ? '#4141A2' : '#A4A9B6' }} />
                            <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>
                                Only import tasks assigned to Developers on the Roster
                            </span>
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: '#717684' }}>
                            When enabled, only tickets assigned to developers with payroll data and a fully loaded salary {'>'} $1 for the selected period will be imported.
                        </p>
                    </div>
                </div>

                {/* Query Description Box */}
                {hasSelection && (
                    <div className="mt-5 p-4 rounded-xl" style={{ background: '#FFFCEB', border: '1px solid #F5E6A3' }}>
                        <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#D3A236' }} />
                            <div className="text-sm" style={{ color: '#3F4450' }}>
                                <p className="font-semibold mb-1.5" style={{ color: '#8B7020' }}>Import Query</p>
                                <ul className="space-y-1 text-[13px]" style={{ color: '#5A4A1A' }}>
                                    <li>
                                        <strong>Period:</strong> {getMonthLabel(month)} 1 – {getMonthLabel(month)} {getLastDayOfMonth(year, month)}, {year}
                                    </li>
                                    <li>
                                        <strong>Resolved tickets:</strong> All tickets resolved between {getMonthLabel(month)} 1 and {getMonthLabel(month)} {getLastDayOfMonth(year, month)}, {year} (regardless of when created)
                                    </li>
                                    <li>
                                        <strong>Open tickets:</strong> All tickets still open as of {getMonthLabel(month)} {getLastDayOfMonth(year, month)}, {year} — not resolved before {getMonthLabel(month)} 1 and not closed during the period
                                    </li>
                                    {rosterOnly && (
                                        <li>
                                            <strong>Roster filter:</strong> Only tickets assigned to developers on the payroll roster for {getMonthLabel(month)} {year} with a fully loaded salary {'>'} $1
                                        </li>
                                    )}
                                    <li>
                                        <strong>Depreciation starts:</strong> {depreciationStart}
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="p-3 mt-5 rounded-lg flex items-start gap-2 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                        <AlertCircle className="w-4 h-4 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="mt-5">
                    <Button onClick={handlePreview} isLoading={previewing} disabled={!hasSelection || loadingPeriods}>
                        <Search className="w-4 h-4" /> Preview Tickets
                    </Button>
                </div>
            </Card>

            {/* Preview Results */}
            {hasPreviewed && (
                <div className="glass-card p-6 border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <CheckSquare size={16} style={{ color: '#21944E' }} />
                            <h3 className="font-semibold" style={{ color: '#3F4450' }}>Trial Run Results ({filteredTickets.length} found)</h3>
                        </div>
                        {previewTickets.length > 0 && (
                            <Button onClick={handleImport} isLoading={importing}>
                                <Download className="w-4 h-4" /> Import {filteredTickets.filter(t => selectedTicketIds.has(t.ticketId)).length} Tickets
                            </Button>
                        )}
                    </div>

                    {previewTickets.length === 0 ? (
                        <div className="text-center py-10" style={{ color: '#717684' }}>
                            <p className="mb-2">No tickets found matching your criteria.</p>
                            <p className="text-xs">Try adjusting the month or disabling the roster filter.</p>
                        </div>
                    ) : (() => {
                        const dynamicColumns = customFieldsConfig.map(f => f.name);
                        return (
                            <div style={{ overflowX: 'auto', maxHeight: '500px', minHeight: '350px' }}>
                                <table className="data-table">
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#FFFFFF' }}>
                                        <tr>
                                            <th className="w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={filteredTickets.filter(t => t.importable).length > 0 && selectedTicketIds.size === filteredTickets.filter(t => t.importable).length}
                                                    onChange={selectAll}
                                                    className="cursor-pointer"
                                                />
                                            </th>
                                            {customFieldsConfig.map((col, idx) => {
                                                const isFiltered = columnFilters[col.name] !== undefined;
                                                const uniqueVals = openFilterColumn === col.name ? getUniqueValuesForCol(col.name) : [];
                                                const isLastHalf = idx > customFieldsConfig.length / 2;

                                                return (
                                                    <th key={col.id} style={{ textTransform: 'uppercase', position: 'relative' }}>
                                                        <div className="flex items-center gap-1">
                                                            {col.name}
                                                            <button
                                                                onClick={() => setOpenFilterColumn(openFilterColumn === col.name ? null : col.name)}
                                                                className={`ml-1 p-0.5 rounded transition hover:bg-black/5 ${isFiltered ? 'text-blue-600' : 'text-gray-400'}`}
                                                            >
                                                                <Filter size={12} />
                                                            </button>
                                                        </div>

                                                        {openFilterColumn === col.name && (
                                                            <>
                                                                <div
                                                                    className="fixed inset-0 cursor-auto"
                                                                    style={{ zIndex: 40 }}
                                                                    onClick={(e) => { e.stopPropagation(); setOpenFilterColumn(null); }}
                                                                />
                                                                <div
                                                                    className={`absolute top-full mt-1 w-48 bg-white border rounded shadow-xl p-2 font-normal text-left ${isLastHalf ? 'right-0' : 'left-0'}`}
                                                                    style={{ textTransform: 'none', zIndex: 50 }}
                                                                >
                                                                    <div className="flex justify-between items-center mb-2 pb-2 border-b">
                                                                        <span className="text-xs font-semibold" style={{ color: '#3F4450' }}>Filter {col.name}</span>
                                                                        <div className="flex gap-2">
                                                                            <button onClick={() => selectAllFilter(col.name)} className="text-[10px] text-blue-600 hover:underline">All</button>
                                                                            <button onClick={() => clearFilter(col.name)} className="text-[10px] text-gray-500 hover:underline">Clear</button>
                                                                        </div>
                                                                    </div>
                                                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                                                        {uniqueVals.map(v => {
                                                                            const isChecked = !columnFilters[col.name] || columnFilters[col.name].has(v);
                                                                            return (
                                                                                <label key={v} className="flex items-start gap-2 text-xs cursor-pointer p-1 hover:bg-gray-50 rounded select-none">
                                                                                    <input type="checkbox" className="mt-0.5" checked={isChecked} onChange={() => handleFilterToggle(col.name, v)} />
                                                                                    <span className="truncate" style={{ color: '#3F4450' }} title={v}>{v}</span>
                                                                                </label>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTickets.map(ticket => (
                                            <tr key={ticket.ticketId} title={ticket.importable ? "" : ticket.unimportableReasons?.join('\n')} style={{ background: selectedTicketIds.has(ticket.ticketId) ? '#F8F9FA' : 'transparent', opacity: ticket.importable ? 1 : 0.5 }}>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedTicketIds.has(ticket.ticketId)}
                                                            disabled={!ticket.importable}
                                                            onChange={() => toggleSelection(ticket.ticketId)}
                                                            className={ticket.importable ? "cursor-pointer" : "cursor-not-allowed"}
                                                        />
                                                        {!ticket.importable && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 cursor-help" title={ticket.unimportableReasons?.join('\n')}>
                                                                Skipped
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                {customFieldsConfig.map(col => {
                                                    const val = ticket.customFields?.[col.name];
                                                    if (col.id === 'issuetype' && val) {
                                                        const upperVal = String(val).toUpperCase();
                                                        return (
                                                            <td key={col.id}>
                                                                <span className="badge" style={{
                                                                    background: upperVal === 'STORY' ? '#EBF5EF' : upperVal === 'BUG' ? '#FFF5F5' : '#F0EAF8',
                                                                    color: upperVal === 'STORY' ? '#21944E' : upperVal === 'BUG' ? '#FA4338' : '#4141A2',
                                                                    fontSize: 10
                                                                }}>
                                                                    {upperVal}
                                                                </span>
                                                            </td>
                                                        );
                                                    }
                                                    if (col.id === 'issuekey' && val) {
                                                        return <td key={col.id}><span className="text-xs font-mono" style={{ color: '#4141A2' }}>{val}</span></td>;
                                                    }
                                                    return (
                                                        <td key={col.id} className="text-sm max-w-[250px] truncate" title={val || ''}>
                                                            {val || '-'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
