'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Calendar, CheckSquare, Download, AlertCircle, Filter, ChevronLeft, ChevronRight, Users, Info, Clock, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import { JiraTicketLink } from '@/components/JiraTicketPanel';
import { MONTH_NAMES, formatPeriodLabel } from '@/lib/periodLabel';
import LoadingPanel from '@/components/wizard/LoadingPanel';
import ColumnFilterModal from '@/components/import/ColumnFilterModal';

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
    const [missingCarryForwards, setMissingCarryForwards] = useState<{
        ticketId: string;
        importPeriod: string | null;
        resolutionDate: string | null;
        assigneeName: string | null;
        summary: string | null;
        customFields: Record<string, string>;
    }[]>([]);
    const [previousPeriodLabel, setPreviousPeriodLabel] = useState<string | null>(null);
    const [bucketFilter, setBucketFilter] = useState<'all' | 'new' | 'carryForwardMatched' | 'carryForwardUnexpected'>('all');
    const [customFieldsConfig, setCustomFieldsConfig] = useState<{ id: string, name: string }[]>([]);
    const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
    const [hasPreviewed, setHasPreviewed] = useState(false);

    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
    const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);

    // Saved column filters from the prior period (so the modal can pre-fill)
    const [previousPeriodFilters, setPreviousPeriodFilters] = useState<Record<string, string[]> | null>(null);
    const [filterModalOpen, setFilterModalOpen] = useState(false);
    // Track whether we've auto-opened the modal for this preview already
    // (only auto-open the first time per preview run; user can reopen via the
    // "Configure filters" button afterward).
    const autoOpenedForPreview = useRef<boolean>(false);

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

    // Auto-open the filter modal once per successful preview, only after
    // customFieldsConfig is populated so the modal has columns to render.
    useEffect(() => {
        if (hasPreviewed && customFieldsConfig.length > 0 && !autoOpenedForPreview.current) {
            autoOpenedForPreview.current = true;
            setFilterModalOpen(true);
        }
    }, [hasPreviewed, customFieldsConfig.length]);

    const hasSelection = month > 0;
    const startDate = hasSelection ? `${year}-${String(month).padStart(2, '0')}-01` : '';
    const endDate = hasSelection ? `${year}-${String(month).padStart(2, '0')}-${getLastDayOfMonth(year, month)}` : '';
    const depreciationStart = hasSelection
        ? (month === 12 ? `${getMonthLabel(1)} ${year + 1}` : `${getMonthLabel(month + 1)} ${year}`)
        : '';

    // ── Date-aware column filtering ───────────────────────────────────────
    // Cells like "2026-02-27T23:18:32.564-0800" are unique per row, so the
    // generic unique-values filter is useless on them. Detect date-shaped
    // columns and switch their filter UI to a hierarchical Year → Month
    // tree, with the in-set check operating on YYYY-MM keys.
    const isIsoDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}/.test(v);
    const yearMonth = (v: string): string => v.slice(0, 7); // "YYYY-MM"

    const dateColumns = useMemo(() => {
        const result = new Set<string>();
        for (const col of customFieldsConfig) {
            let dateCount = 0;
            let totalCount = 0;
            for (const t of previewTickets) {
                const raw = t.customFields?.[col.name];
                if (raw == null || raw === '') continue;
                totalCount++;
                if (isIsoDate(String(raw))) dateCount++;
            }
            // Treat as date column if at least 60% of non-blank values parse.
            if (totalCount > 0 && dateCount / totalCount >= 0.6) {
                result.add(col.name);
            }
        }
        return result;
    }, [previewTickets, customFieldsConfig]);

    const cellFilterKey = (colName: string, raw: string): string => {
        if (raw === '(Blank)') return '(Blank)';
        if (dateColumns.has(colName) && isIsoDate(raw)) return yearMonth(raw);
        return raw;
    };

    // Bucket pill counts and the visible table both derive from the
    // column-filtered subset, so as the user narrows columns the
    // "Unexpected carry-forward" pill drops to match what will actually
    // be imported.
    const columnFilteredTickets = useMemo(() => {
        if (Object.keys(columnFilters).length === 0) return previewTickets;
        return previewTickets.filter(ticket => {
            for (const [colName, allowedValues] of Object.entries(columnFilters)) {
                const raw = (ticket.customFields?.[colName] || '(Blank)').toString();
                const key = cellFilterKey(colName, raw);
                if (!allowedValues.has(key)) return false;
            }
            return true;
        });
    // cellFilterKey closes over dateColumns, so listing it explicitly is enough
    }, [previewTickets, columnFilters, dateColumns]);

    const bucketCounts = useMemo(() => ({
        all: columnFilteredTickets.length,
        new: columnFilteredTickets.filter(t => t.bucket === 'new').length,
        carryForwardMatched: columnFilteredTickets.filter(t => t.bucket === 'carryForwardMatched').length,
        carryForwardUnexpected: columnFilteredTickets.filter(t => t.bucket === 'carryForwardUnexpected').length,
    }), [columnFilteredTickets]);

    const filteredTickets = useMemo(() => {
        if (bucketFilter === 'all') return columnFilteredTickets;
        return columnFilteredTickets.filter(t => t.bucket === bucketFilter);
    }, [columnFilteredTickets, bucketFilter]);

    // Detail rows for the "Unexpected carry-forward" audit panel — tickets
    // Jira returned that weren't in our database as open at end of the prior
    // period. Derived from columnFilteredTickets so the panel mirrors any
    // column filter the user applies.
    const filteredUnexpectedCF = useMemo(
        () => columnFilteredTickets.filter(t => t.bucket === 'carryForwardUnexpected'),
        [columnFilteredTickets],
    );
    const totalUnexpectedCF = useMemo(
        () => previewTickets.filter(t => t.bucket === 'carryForwardUnexpected').length,
        [previewTickets],
    );

    // Apply the same column filters to the missing-carry-forward audit panel
    // (using customFields persisted from the prior import) so the audit list
    // narrows alongside the trial-run table — letting the user drill into
    // exactly which expected tickets are still missing for their slice.
    const filteredMissingCarryForwards = useMemo(() => {
        if (Object.keys(columnFilters).length === 0) return missingCarryForwards;
        return missingCarryForwards.filter(t => {
            const cf = t.customFields || {};
            for (const [colName, allowedValues] of Object.entries(columnFilters)) {
                const raw = (cf[colName] || '(Blank)').toString();
                const key = cellFilterKey(colName, raw);
                if (!allowedValues.has(key)) return false;
            }
            return true;
        });
    // cellFilterKey closes over dateColumns
    }, [missingCarryForwards, columnFilters, dateColumns]);

    const getUniqueValuesForCol = (colName: string): string[] => {
        const vals = new Set<string>();
        previewTickets.forEach(t => {
            const raw = (t.customFields?.[colName] || '(Blank)').toString();
            vals.add(cellFilterKey(colName, raw));
        });
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
            setMissingCarryForwards(data.buckets?.missingCarryForwards || []);
            setPreviousPeriodLabel(data.previousPeriodLabel || null);
            setCustomFieldsConfig(data.customFieldsConfig || []);
            setPreviousPeriodFilters(data.previousPeriodFilters || null);
            const importable = data.tickets.filter((t: any) => t.importable);
            setSelectedTicketIds(new Set(importable.map((t: any) => t.ticketId)));
            setColumnFilters({});
            setBucketFilter('all');
            setHasPreviewed(true);
            // Auto-open the filter modal once per preview so the user
            // can confirm or override the prior period's selections before
            // touching the table.
            autoOpenedForPreview.current = false;
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
        // Serialize the active column filters so they can be saved keyed
        // to this import period and pre-fill next month's filter modal.
        const serializedFilters: Record<string, string[]> = {};
        for (const [col, set] of Object.entries(columnFilters)) {
            serializedFilters[col] = Array.from(set);
        }
        try {
            const res = await fetch('/api/integrations/jira/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tickets: ticketsToImport,
                    importPeriod: formatPeriodLabel(month, year),
                    columnFilters: serializedFilters,
                }),
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
        <div className="w-full">
            <Link href="/projects/details" className="btn-ghost mb-6 inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Back to Project Details
            </Link>

            <div className="mb-8">
                <h1 className="section-header">Import Period from Jira</h1>
                <p className="section-subtext">Select a payroll period and import Jira tickets for capitalization.</p>
            </div>

            {/* ── Loading overlay during preview / import ── */}
            {previewing && (
                <LoadingPanel
                    title={`Fetching Jira tickets for ${getMonthLabel(month)} ${year}…`}
                    subtitle="Large date ranges or busy Jira instances can take 30–90 seconds. You can leave this tab open — we'll keep working in the background."
                    expectedSeconds={45}
                    stages={[
                        { at: 0,  label: 'Authenticating with Jira and loading custom-field config…' },
                        { at: 4,  label: `Querying tickets active between ${startDate} and ${endDate} (resolved in period or still open at period end)…` },
                        { at: 14, label: 'Paginating through Jira issues (100 per page)…' },
                        { at: 28, label: 'Collecting the period import snapshot…' },
                        { at: 45, label: rosterOnly ? 'Matching assignees against the payroll roster…' : 'Matching assignees to your developer list…' },
                        { at: 60, label: 'Bucketing into new / carry-forward / unexpected and computing audit gaps…' },
                        { at: 80, label: 'Almost there — finalizing the preview…' },
                    ]}
                />
            )}

            {importing && (
                <LoadingPanel
                    title={`Importing tickets for ${getMonthLabel(month)} ${year}…`}
                    subtitle="Persisting tickets, refreshing carry-forwards, and recomputing per-ticket cost allocation."
                    expectedSeconds={20}
                    stages={[
                        { at: 0,  label: 'Validating the selected ticket set…' },
                        { at: 3,  label: 'Auto-creating any missing project rows from epic keys…' },
                        { at: 7,  label: 'Inserting new tickets and refreshing carry-forwards in batches…' },
                        { at: 14, label: 'Linking orphaned tickets back to their projects…' },
                        { at: 20, label: 'Recomputing per-ticket cost allocation for the period…' },
                        { at: 30, label: 'Wrapping up — clearing caches…' },
                    ]}
                />
            )}

            {/* Import Criteria Card */}
            {!previewing && !importing && (
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
                                        <strong>Resolved in period:</strong> all tickets resolved between {getMonthLabel(month)} 1 and {getMonthLabel(month)} {getLastDayOfMonth(year, month)}, {year} — regardless of when they were created.
                                    </li>
                                    <li>
                                        <strong>Open at period end:</strong> all tickets created on or before {getMonthLabel(month)} {getLastDayOfMonth(year, month)}, {year} that were still unresolved as of that date — captures the full universe of work-in-progress so developer cost can be distributed across every ticket worked on.
                                    </li>
                                    <li>
                                        <strong>Excluded:</strong> tickets resolved before {getMonthLabel(month)} 1, {year} — they belong to the earlier period in which they closed.
                                    </li>
                                    {rosterOnly && (
                                        <li>
                                            <strong>Roster filter:</strong> only tickets assigned to developers on the payroll roster for {getMonthLabel(month)} {year} with a fully loaded salary {'>'} $1.
                                        </li>
                                    )}
                                    <li>
                                        <strong>Amortization:</strong> tickets resolved this period begin amortizing in {depreciationStart}; tickets still open stay in WIP and start amortizing the month after they resolve.
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
            )}

            {/* Audit-B: tickets Jira returned that aren't in our DB as open at end of prior period.
                These will be imported with an audit flag — surface them here so the user can drill in. */}
            {!previewing && !importing && hasPreviewed && filteredUnexpectedCF.length > 0 && (
                <Card className="p-5 mb-4 border-2" style={{ borderColor: '#F0B872', background: '#FFF4E0' }}>
                    <div className="flex items-start gap-3 mb-3">
                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#A85D00' }} />
                        <div className="flex-1">
                            <h3 className="font-semibold text-sm mb-1" style={{ color: '#A85D00' }}>
                                {filteredUnexpectedCF.length} unexpected carry-forward{filteredUnexpectedCF.length === 1 ? '' : 's'} from Jira
                                {filteredUnexpectedCF.length !== totalUnexpectedCF && (
                                    <span className="font-normal" style={{ color: '#A85D00' }}> · {totalUnexpectedCF} before column filters</span>
                                )}
                            </h3>
                            <p className="text-[12px]" style={{ color: '#7A4500' }}>
                                These tickets came back from Jira's query for {getMonthLabel(month)} {year} but were <strong>not</strong> in our database as open at end of <strong>{previousPeriodLabel || 'the prior period'}</strong>. They were created earlier and should have been imported in a prior period — most likely the one shown in <em>Should have been imported</em>. They will be imported with an audit flag if you proceed.
                            </p>
                        </div>
                    </div>
                    <div className="border rounded overflow-hidden bg-white" style={{ borderColor: '#F0CCA0', maxHeight: 320, overflowY: 'auto' }}>
                        <table className="w-full text-xs">
                            <thead style={{ background: '#FAFBFC', position: 'sticky', top: 0 }}>
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Ticket</th>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Summary</th>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Assignee</th>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Should have been imported</th>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Resolution</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUnexpectedCF.map(t => (
                                    <tr key={t.ticketId} style={{ borderTop: '1px solid #F0CCA0' }}>
                                        <td className="px-3 py-1.5"><JiraTicketLink ticketId={t.ticketId} className="text-xs" style={{ color: '#4141A2' }} /></td>
                                        <td className="px-3 py-1.5 max-w-[280px] truncate" style={{ color: '#3F4450' }} title={t.summary || ''}>{t.summary || '—'}</td>
                                        <td className="px-3 py-1.5" style={{ color: '#717684' }}>{t.assigneeName || '—'}</td>
                                        <td className="px-3 py-1.5" style={{ color: '#717684' }}>{t.originPeriod || '—'}</td>
                                        <td className="px-3 py-1.5" style={{ color: '#717684' }}>{t.resolutionDate ? new Date(t.resolutionDate).toLocaleDateString() : 'Open'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Audit-A: tickets we expected to see as carry-forwards but Jira didn't return */}
            {!previewing && !importing && hasPreviewed && filteredMissingCarryForwards.length > 0 && (
                <Card className="p-5 mb-4 border-2" style={{ borderColor: '#F5C76A', background: '#FFFCEB' }}>
                    <div className="flex items-start gap-3 mb-3">
                        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#D3A236' }} />
                        <div className="flex-1">
                            <h3 className="font-semibold text-sm mb-1" style={{ color: '#8B7020' }}>
                                {filteredMissingCarryForwards.length} expected carry-forward{filteredMissingCarryForwards.length === 1 ? '' : 's'} not found in Jira's response
                                {filteredMissingCarryForwards.length !== missingCarryForwards.length && (
                                    <span className="font-normal" style={{ color: '#A4762A' }}> · {missingCarryForwards.length} before column filters</span>
                                )}
                            </h3>
                            <p className="text-[12px]" style={{ color: '#5A4A1A' }}>
                                These tickets were active at end of <strong>{previousPeriodLabel}</strong> in our database (open or unresolved at that snapshot)
                                but did not come back from Jira's query for {getMonthLabel(month)} {year}. They may have been resolved out-of-band, deleted,
                                or moved out of scope. Review and decide whether to leave them as-is or update their status manually.
                            </p>
                        </div>
                    </div>
                    <div className="border rounded overflow-hidden bg-white" style={{ borderColor: '#F5E6A3' }}>
                        <table className="w-full text-xs">
                            <thead style={{ background: '#FAFBFC' }}>
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Ticket</th>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Summary</th>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Assignee</th>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>First Imported</th>
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', fontSize: 9 }}>Last-Known Resolution</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMissingCarryForwards.map(t => (
                                    <tr key={t.ticketId} style={{ borderTop: '1px solid #F0E4B8' }}>
                                        <td className="px-3 py-1.5"><JiraTicketLink ticketId={t.ticketId} className="text-xs" style={{ color: '#4141A2' }} /></td>
                                        <td className="px-3 py-1.5 max-w-[280px] truncate" style={{ color: '#3F4450' }} title={t.summary || ''}>{t.summary || '—'}</td>
                                        <td className="px-3 py-1.5" style={{ color: '#717684' }}>{t.assigneeName || '—'}</td>
                                        <td className="px-3 py-1.5" style={{ color: '#717684' }}>{t.importPeriod || '—'}</td>
                                        <td className="px-3 py-1.5" style={{ color: '#717684' }}>{t.resolutionDate ? new Date(t.resolutionDate).toLocaleDateString() : 'Open'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Preview Results */}
            {!previewing && !importing && hasPreviewed && (
                <div className="glass-card p-6 border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <CheckSquare size={16} style={{ color: '#21944E' }} />
                            <h3 className="font-semibold" style={{ color: '#3F4450' }}>Trial Run Results ({filteredTickets.length} shown · {previewTickets.length} total)</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setFilterModalOpen(true)}
                                className="text-xs font-semibold inline-flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-50"
                                style={{ color: Object.keys(columnFilters).length > 0 ? '#4141A2' : '#717684', border: `1px solid ${Object.keys(columnFilters).length > 0 ? '#4141A2' : '#E2E4E9'}` }}
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                {Object.keys(columnFilters).length > 0
                                    ? `${Object.keys(columnFilters).length} column filter${Object.keys(columnFilters).length === 1 ? '' : 's'}`
                                    : 'Configure column filters'}
                            </button>
                            {previewTickets.length > 0 && (
                                <Button onClick={handleImport} isLoading={importing}>
                                    <Download className="w-4 h-4" /> Import {filteredTickets.filter(t => selectedTicketIds.has(t.ticketId)).length} Tickets
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Bucket pills — filter the table to one source class */}
                    {previewTickets.length > 0 && (
                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                            {([
                                { key: 'all', label: 'All', count: bucketCounts.all, color: '#717684', bg: '#F6F6F9' },
                                { key: 'new', label: 'New in period', count: bucketCounts.new, color: '#21944E', bg: '#EBF5EF' },
                                { key: 'carryForwardMatched', label: `Carry-forward (matched)`, count: bucketCounts.carryForwardMatched, color: '#4141A2', bg: '#F0F0FA' },
                                { key: 'carryForwardUnexpected', label: 'Unexpected carry-forward', count: bucketCounts.carryForwardUnexpected, color: '#A85D00', bg: '#FFF4E0' },
                            ] as const).map(p => {
                                const isActive = bucketFilter === p.key;
                                return (
                                    <button
                                        key={p.key}
                                        onClick={() => setBucketFilter(p.key)}
                                        className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
                                        style={{
                                            background: isActive ? p.color : p.bg,
                                            color: isActive ? '#FFFFFF' : p.color,
                                            border: `1px solid ${isActive ? p.color : 'transparent'}`,
                                        }}
                                    >
                                        {p.label} <span className="opacity-80">· {p.count}</span>
                                    </button>
                                );
                            })}
                            {bucketCounts.carryForwardUnexpected > 0 && (
                                <span className="text-[11px] inline-flex items-center gap-1" style={{ color: '#A85D00' }}>
                                    <AlertCircle className="w-3 h-3" />
                                    Unexpected carry-forwards weren't in our database as open at end of {previousPeriodLabel || 'the prior period'}.
                                </span>
                            )}
                        </div>
                    )}

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
                                            <th style={{ textTransform: 'uppercase' }}>Source</th>
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
                                                                    <div className="max-h-64 overflow-y-auto space-y-1">
                                                                        {dateColumns.has(col.name) ? (() => {
                                                                            // Hierarchical year → month tree for date-shaped columns
                                                                            const blankSelected = !columnFilters[col.name] || columnFilters[col.name].has('(Blank)');
                                                                            const dateKeys = uniqueVals.filter(v => v !== '(Blank)').sort().reverse();
                                                                            const byYear: Record<string, string[]> = {};
                                                                            for (const ym of dateKeys) {
                                                                                const yr = ym.slice(0, 4);
                                                                                if (!byYear[yr]) byYear[yr] = [];
                                                                                byYear[yr].push(ym);
                                                                            }
                                                                            const yearKeys = Object.keys(byYear).sort().reverse();
                                                                            const isMonthChecked = (m: string) => !columnFilters[col.name] || columnFilters[col.name].has(m);
                                                                            const yearAllChecked = (yr: string) => byYear[yr].every(m => isMonthChecked(m));
                                                                            const toggleYear = (yr: string) => {
                                                                                setColumnFilters(prev => {
                                                                                    const next = { ...prev };
                                                                                    const all = getUniqueValuesForCol(col.name);
                                                                                    const current = new Set(next[col.name] || all);
                                                                                    const yearMonths = byYear[yr];
                                                                                    const allOn = yearMonths.every(m => current.has(m));
                                                                                    if (allOn) yearMonths.forEach(m => current.delete(m));
                                                                                    else yearMonths.forEach(m => current.add(m));
                                                                                    if (current.size === all.length) delete next[col.name];
                                                                                    else next[col.name] = current;
                                                                                    return next;
                                                                                });
                                                                            };
                                                                            const monthName = (mm: string) => MONTH_NAMES[parseInt(mm, 10) - 1] ?? mm;
                                                                            return (
                                                                                <>
                                                                                    {uniqueVals.includes('(Blank)') && (
                                                                                        <label className="flex items-start gap-2 text-xs cursor-pointer p-1 hover:bg-gray-50 rounded select-none">
                                                                                            <input type="checkbox" className="mt-0.5" checked={blankSelected} onChange={() => handleFilterToggle(col.name, '(Blank)')} />
                                                                                            <span style={{ color: '#717684', fontStyle: 'italic' }}>(Blank)</span>
                                                                                        </label>
                                                                                    )}
                                                                                    {yearKeys.map(yr => (
                                                                                        <div key={yr}>
                                                                                            <label className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-gray-50 rounded select-none font-semibold">
                                                                                                <input type="checkbox" checked={yearAllChecked(yr)} onChange={() => toggleYear(yr)} />
                                                                                                <span style={{ color: '#3F4450' }}>{yr}</span>
                                                                                                <span className="ml-auto text-[10px]" style={{ color: '#A4A9B6' }}>{byYear[yr].length} mo</span>
                                                                                            </label>
                                                                                            <div className="ml-5 border-l border-gray-200 pl-2">
                                                                                                {byYear[yr].map(ym => {
                                                                                                    const mm = ym.slice(5, 7);
                                                                                                    return (
                                                                                                        <label key={ym} className="flex items-center gap-2 text-xs cursor-pointer p-0.5 hover:bg-gray-50 rounded select-none">
                                                                                                            <input type="checkbox" checked={isMonthChecked(ym)} onChange={() => handleFilterToggle(col.name, ym)} />
                                                                                                            <span style={{ color: '#3F4450' }}>{monthName(mm)}</span>
                                                                                                        </label>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </>
                                                                            );
                                                                        })() : (
                                                                            uniqueVals.map(v => {
                                                                                const isChecked = !columnFilters[col.name] || columnFilters[col.name].has(v);
                                                                                return (
                                                                                    <label key={v} className="flex items-start gap-2 text-xs cursor-pointer p-1 hover:bg-gray-50 rounded select-none">
                                                                                        <input type="checkbox" className="mt-0.5" checked={isChecked} onChange={() => handleFilterToggle(col.name, v)} />
                                                                                        <span className="truncate" style={{ color: '#3F4450' }} title={v}>{v}</span>
                                                                                    </label>
                                                                                );
                                                                            })
                                                                        )}
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
                                        {filteredTickets.map(ticket => {
                                            const bucketStyle = ticket.bucket === 'new'
                                                ? { bg: '#EBF5EF', color: '#21944E', label: 'New' }
                                                : ticket.bucket === 'carryForwardMatched'
                                                ? { bg: '#F0F0FA', color: '#4141A2', label: `Carry-forward${ticket.originPeriod ? ` · ${ticket.originPeriod}` : ''}` }
                                                : { bg: '#FFF4E0', color: '#A85D00', label: `Unexpected${ticket.originPeriod ? ` · ${ticket.originPeriod}` : ''}` };
                                            return (
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
                                                <td>
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap" style={{ background: bucketStyle.bg, color: bucketStyle.color }}>
                                                        {ticket.bucket !== 'new' && <Clock className="w-2.5 h-2.5" />}
                                                        {bucketStyle.label}
                                                    </span>
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
                                                        return <td key={col.id}><JiraTicketLink ticketId={String(val)} className="text-xs" style={{ color: '#4141A2' }} /></td>;
                                                    }
                                                    return (
                                                        <td key={col.id} className="text-sm max-w-[250px] truncate" title={val || ''}>
                                                            {val || '-'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>
            )}

            <ColumnFilterModal
                open={filterModalOpen}
                onClose={() => setFilterModalOpen(false)}
                onApply={(filters) => setColumnFilters(filters)}
                customFieldsConfig={customFieldsConfig}
                previewTickets={previewTickets}
                dateColumns={dateColumns}
                cellFilterKey={cellFilterKey}
                initialFilters={columnFilters}
                priorFilters={previousPeriodFilters}
                priorPeriodLabel={previousPeriodLabel}
            />
        </div>
    );
}
