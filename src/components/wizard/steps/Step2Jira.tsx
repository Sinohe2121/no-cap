'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Search, Download, AlertCircle, CheckSquare, Info, ListFilter, Edit3, Users, Filter, Clock, AlertTriangle } from 'lucide-react';
import { useWizard } from '@/context/WizardContext';
import LoadingPanel from '../LoadingPanel';

const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

interface CapRule {
    priority: number;
    issueType: string;
    projectStatus: string;
    projectCapitalizable: boolean | null;
    action: string;
}

interface PreviewTicket {
    ticketId: string;
    summary?: string;
    issueType?: string;
    assigneeName?: string;
    importable: boolean;
    unimportableReasons?: string[];
    customFields?: Record<string, string>;
    bucket?: 'new' | 'carryForwardMatched' | 'carryForwardUnexpected';
    originPeriod?: string | null;
}

interface MissingCarryForward {
    ticketId: string;
    importPeriod: string | null;
    resolutionDate: string | null;
    assigneeName: string | null;
    summary: string | null;
}

interface CustomFieldConfig { id: string; name: string }

type WizardPhase = 'review-rules' | 'preview' | 'imported';

function actionStyle(action: string) {
    if (action === 'CAPITALIZE') return { bg: '#EBF5EF', color: '#21944E' };
    if (action === 'EXPENSE') return { bg: '#FFF5F5', color: '#FA4338' };
    return { bg: '#F6F6F9', color: '#717684' };
}

export default function Step2Jira() {
    const router = useRouter();
    const { period, goTo, markCompleted, close } = useWizard();
    const [phase, setPhase] = useState<WizardPhase>('review-rules');

    // Rules
    const [rules, setRules] = useState<CapRule[]>([]);
    const [rulesLoading, setRulesLoading] = useState(true);

    // Roster filter + preview
    const [rosterOnly, setRosterOnly] = useState(true);
    const [previewing, setPreviewing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [tickets, setTickets] = useState<PreviewTicket[]>([]);
    const [missingCarryForwards, setMissingCarryForwards] = useState<MissingCarryForward[]>([]);
    const [previousPeriodLabel, setPreviousPeriodLabel] = useState<string | null>(null);
    const [bucketFilter, setBucketFilter] = useState<'all' | 'new' | 'carryForwardMatched' | 'carryForwardUnexpected'>('all');
    const [customFieldsConfig, setCustomFieldsConfig] = useState<CustomFieldConfig[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
    const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [importedCount, setImportedCount] = useState(0);

    useEffect(() => {
        setRulesLoading(true);
        fetch('/api/rules')
            .then(r => r.ok ? r.json() : [])
            .then(d => setRules(Array.isArray(d) ? d : []))
            .finally(() => setRulesLoading(false));
    }, []);

    if (!period) {
        return (
            <div className="rounded-xl p-4 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                No period selected. Go back to Step 1 to choose a payroll period.
            </div>
        );
    }

    const startDate = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    const lastDay = new Date(period.year, period.month, 0).getDate();
    const endDate = `${period.year}-${String(period.month).padStart(2, '0')}-${lastDay}`;
    const depreciationStart = period.month === 12
        ? `${MONTH_NAMES[0]} ${period.year + 1}`
        : `${MONTH_NAMES[period.month]} ${period.year}`;

    const handlePreview = async () => {
        setPreviewing(true);
        setError(null);
        try {
            const res = await fetch('/api/integrations/jira/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate, endDate, rosterOnly, year: period.year, month: period.month }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Preview failed');
            const data = await res.json();
            const arr: PreviewTicket[] = data.tickets || [];
            setTickets(arr);
            setMissingCarryForwards(data.buckets?.missingCarryForwards || []);
            setPreviousPeriodLabel(data.previousPeriodLabel || null);
            setCustomFieldsConfig(data.customFieldsConfig || []);
            setColumnFilters({});
            setOpenFilterColumn(null);
            setBucketFilter('all');
            setSelectedIds(new Set(arr.filter(t => t.importable).map(t => t.ticketId)));
            setPhase('preview');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Preview failed');
        } finally {
            setPreviewing(false);
        }
    };

    const bucketCounts = useMemo(() => ({
        all: tickets.length,
        new: tickets.filter(t => t.bucket === 'new').length,
        carryForwardMatched: tickets.filter(t => t.bucket === 'carryForwardMatched').length,
        carryForwardUnexpected: tickets.filter(t => t.bucket === 'carryForwardUnexpected').length,
    }), [tickets]);

    // ── Date-aware column filtering (same as standalone import page) ──────
    // ISO timestamps are unique per ticket, making the unique-values list
    // useless. Detect date-shaped columns and bucket their filter keys to
    // YYYY-MM, then render a Year → Month tree in the dropdown.
    const isIsoDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}/.test(v);
    const yearMonth = (v: string): string => v.slice(0, 7);

    const dateColumns = useMemo(() => {
        const result = new Set<string>();
        for (const col of customFieldsConfig) {
            let dateCount = 0;
            let totalCount = 0;
            for (const t of tickets) {
                const raw = t.customFields?.[col.name];
                if (raw == null || raw === '') continue;
                totalCount++;
                if (isIsoDate(String(raw))) dateCount++;
            }
            if (totalCount > 0 && dateCount / totalCount >= 0.6) result.add(col.name);
        }
        return result;
    }, [tickets, customFieldsConfig]);

    const cellFilterKey = (colName: string, raw: string): string => {
        if (raw === '(Blank)') return '(Blank)';
        if (dateColumns.has(colName) && isIsoDate(raw)) return yearMonth(raw);
        return raw;
    };

    const filteredTickets = useMemo(() => {
        let rows = tickets;
        if (bucketFilter !== 'all') {
            rows = rows.filter(t => t.bucket === bucketFilter);
        }
        if (Object.keys(columnFilters).length === 0) return rows;
        return rows.filter(t => {
            for (const [colName, allowed] of Object.entries(columnFilters)) {
                const raw = (t.customFields?.[colName] || '(Blank)').toString();
                const key = cellFilterKey(colName, raw);
                if (!allowed.has(key)) return false;
            }
            return true;
        });
    }, [tickets, bucketFilter, columnFilters, dateColumns]);

    const getUniqueValuesForCol = (colName: string): string[] => {
        const vals = new Set<string>();
        tickets.forEach(t => {
            const raw = (t.customFields?.[colName] || '(Blank)').toString();
            vals.add(cellFilterKey(colName, raw));
        });
        return Array.from(vals).sort();
    };

    const handleFilterToggle = (colName: string, val: string) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            const existing = next[colName] || new Set(getUniqueValuesForCol(colName));
            const ns = new Set(existing);
            if (ns.has(val)) ns.delete(val); else ns.add(val);
            if (ns.size === getUniqueValuesForCol(colName).length) {
                delete next[colName];
            } else {
                next[colName] = ns;
            }
            return next;
        });
    };

    const selectAllFilter = (colName: string) => {
        setColumnFilters(prev => { const n = { ...prev }; delete n[colName]; return n; });
    };

    const clearFilter = (colName: string) => {
        setColumnFilters(prev => ({ ...prev, [colName]: new Set() }));
    };

    const handleImport = async () => {
        const visibleIds = new Set(filteredTickets.map(t => t.ticketId));
        const ticketsToImport = tickets.filter(t => selectedIds.has(t.ticketId) && visibleIds.has(t.ticketId));
        if (ticketsToImport.length === 0) {
            setError('Select at least one visible ticket to import.');
            return;
        }
        setImporting(true);
        setError(null);
        try {
            const res = await fetch('/api/integrations/jira/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tickets: ticketsToImport, importPeriod: period.label }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Import failed');
            setImportedCount(ticketsToImport.length);
            setPhase('imported');
            markCompleted('jira');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    const importableCount = useMemo(() => tickets.filter(t => t.importable).length, [tickets]);
    const filteredImportableCount = useMemo(() => filteredTickets.filter(t => t.importable).length, [filteredTickets]);
    const skippedCount = tickets.length - importableCount;
    const visibleSelectedCount = useMemo(() => {
        const visible = new Set(filteredTickets.map(t => t.ticketId));
        let n = 0;
        for (const id of selectedIds) if (visible.has(id)) n++;
        return n;
    }, [filteredTickets, selectedIds]);
    const filterCount = Object.keys(columnFilters).length;

    return (
        <div className="space-y-6">
            {/* Period banner */}
            <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#F0F0FA', border: '1px solid rgba(65,65,162,0.15)' }}>
                <Info className="w-4 h-4" style={{ color: '#4141A2' }} />
                <p className="text-xs" style={{ color: '#3F4450' }}>
                    Importing tickets for <strong style={{ color: '#4141A2' }}>{period.label}</strong> ({startDate} → {endDate}). Depreciation starts <strong>{depreciationStart}</strong>.
                </p>
            </div>

            {/* ── Loading overlay during preview fetch ── */}
            {previewing && (
                <LoadingPanel
                    title={`Fetching Jira tickets for ${period.label}…`}
                    subtitle="Large date ranges or busy Jira instances can take 30–90 seconds. You can leave the wizard open — we'll keep working in the background."
                    expectedSeconds={45}
                    stages={[
                        { at: 0,  label: 'Authenticating with Jira and loading custom-field config…' },
                        { at: 4,  label: `Querying tickets active between ${startDate} and ${endDate} (resolved in period or still open at period end)…` },
                        { at: 14, label: 'Paginating through Jira issues (100 per page)…' },
                        { at: 28, label: 'Collecting the period import snapshot…' },
                        { at: 45, label: rosterOnly ? 'Matching assignees against the payroll roster…' : 'Matching assignees to your developer list…' },
                        { at: 60, label: 'Building preview rows and applying classification rules…' },
                        { at: 80, label: 'Almost there — finalizing the preview…' },
                    ]}
                />
            )}

            {/* ── Phase: review rules ── */}
            {!previewing && phase === 'review-rules' && (
                <>
                    <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#A4A9B6' }}>
                            Inclusion / exclusion logic
                        </h4>
                        <div className="rounded-xl p-4 text-xs space-y-1.5" style={{ background: '#FFFCEB', border: '1px solid #F5E6A3', color: '#5A4A1A' }}>
                            <p>• <strong>Resolved in period:</strong> every ticket resolved between {MONTH_NAMES[period.month - 1]} 1 and {MONTH_NAMES[period.month - 1]} {lastDay}, {period.year} — regardless of when it was created.</p>
                            <p>• <strong>Open at period end:</strong> every ticket created on or before {MONTH_NAMES[period.month - 1]} {lastDay}, {period.year} that was still unresolved as of that date — so the full universe of tickets worked on this period is available for cost distribution.</p>
                            <p>• <strong>Excluded:</strong> tickets resolved before {MONTH_NAMES[period.month - 1]} 1, {period.year} — they belong to the earlier period in which they closed.</p>
                            <p>• <strong>Roster filter:</strong> when on, only tickets assigned to developers with payroll &gt; $1 for {period.label}.</p>
                            <p>• <strong>BUG tickets:</strong> always expensed, never capitalized — regardless of project status.</p>
                            <p>• <strong>Amortization:</strong> capitalized tickets resolved this period begin amortizing in <strong>{depreciationStart}</strong>; unresolved tickets stay in WIP and start amortizing the month after they resolve.</p>
                        </div>

                        {/* Roster toggle */}
                        <div
                            className="flex items-center gap-3 p-3 mt-3 rounded-xl cursor-pointer transition-all"
                            style={{
                                background: rosterOnly ? '#F0F0FA' : '#F6F6F9',
                                border: rosterOnly ? '1.5px solid #4141A2' : '1.5px solid #E2E4E9',
                            }}
                            onClick={() => setRosterOnly(!rosterOnly)}
                        >
                            <div
                                className="relative w-10 h-5 rounded-full flex-shrink-0"
                                style={{ background: rosterOnly ? '#4141A2' : '#E2E4E9', transition: 'background 0.15s' }}
                            >
                                <div
                                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow"
                                    style={{ left: rosterOnly ? '22px' : '2px', transition: 'left 0.15s' }}
                                />
                            </div>
                            <div>
                                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#3F4450' }}>
                                    <Users className="w-3.5 h-3.5" style={{ color: rosterOnly ? '#4141A2' : '#A4A9B6' }} />
                                    Roster only
                                </p>
                                <p className="text-[11px]" style={{ color: '#717684' }}>
                                    Skip tickets assigned to developers without payroll for this period.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Rules */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>
                                <ListFilter className="w-3.5 h-3.5 inline mr-1" />
                                Current Classification Rules
                            </h4>
                            <button
                                onClick={() => {
                                    close();
                                    router.push('/accounting/classification-rules');
                                }}
                                className="btn-ghost text-xs"
                            >
                                <Edit3 className="w-3.5 h-3.5" /> Edit rules
                            </button>
                        </div>
                        {rulesLoading ? (
                            <p className="text-xs" style={{ color: '#717684' }}>Loading rules…</p>
                        ) : rules.length === 0 ? (
                            <div className="rounded-lg p-3 text-xs" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                                No classification rules set. Default behavior will be used.
                            </div>
                        ) : (
                            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9', maxHeight: 220, overflowY: 'auto' }}>
                                <table className="w-full text-xs">
                                    <thead style={{ background: '#F6F6F9', position: 'sticky', top: 0 }}>
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>#</th>
                                            <th className="px-3 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>ISSUE TYPE</th>
                                            <th className="px-3 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>PROJECT STATUS</th>
                                            <th className="px-3 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>CAPITALIZABLE</th>
                                            <th className="px-3 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>ACTION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rules.map((r, i) => {
                                            const a = actionStyle(r.action);
                                            return (
                                                <tr key={i} style={{ borderTop: '1px solid #E2E4E9' }}>
                                                    <td className="px-3 py-1.5 font-semibold" style={{ color: '#3F4450' }}>{r.priority}</td>
                                                    <td className="px-3 py-1.5" style={{ color: '#3F4450' }}>{r.issueType}</td>
                                                    <td className="px-3 py-1.5" style={{ color: '#717684' }}>{r.projectStatus}</td>
                                                    <td className="px-3 py-1.5" style={{ color: '#717684' }}>
                                                        {r.projectCapitalizable === true ? 'Yes'
                                                            : r.projectCapitalizable === false ? 'No'
                                                            : 'Any'}
                                                    </td>
                                                    <td className="px-3 py-1.5">
                                                        <span className="badge" style={{ background: a.bg, color: a.color, fontSize: 10 }}>
                                                            {r.action}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg flex items-start gap-2 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                            <AlertCircle className="w-4 h-4 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E4E9' }}>
                        <button onClick={() => goTo('payroll')} className="btn-ghost">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button onClick={handlePreview} className="btn-primary" disabled={previewing}>
                            <Search className="w-4 h-4" /> {previewing ? 'Loading…' : 'Rules look good — Preview Tickets'}
                        </button>
                    </div>
                </>
            )}

            {/* ── Phase: preview ── */}
            {phase === 'preview' && (
                <>
                    <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-xl p-3" style={{ background: '#F6F6F9' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#717684' }}>Total Found</p>
                            <p className="text-2xl font-bold tabular-nums" style={{ color: '#3F4450' }}>{tickets.length}</p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: '#EBF5EF' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#21944E' }}>Importable</p>
                            <p className="text-2xl font-bold tabular-nums" style={{ color: '#21944E' }}>{importableCount}</p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: '#FFF5F5' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#FA4338' }}>Skipped</p>
                            <p className="text-2xl font-bold tabular-nums" style={{ color: '#FA4338' }}>{skippedCount}</p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: filterCount > 0 ? '#F0EAF8' : '#F6F6F9' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: filterCount > 0 ? '#4141A2' : '#717684' }}>
                                Visible (filters)
                            </p>
                            <p className="text-2xl font-bold tabular-nums" style={{ color: filterCount > 0 ? '#4141A2' : '#3F4450' }}>{filteredTickets.length}</p>
                        </div>
                    </div>

                    {filterCount > 0 && (
                        <div className="flex items-center justify-between rounded-lg p-2.5" style={{ background: '#F0EAF8', border: '1px solid rgba(65,65,162,0.18)' }}>
                            <p className="text-xs flex items-center gap-1.5" style={{ color: '#4141A2' }}>
                                <Filter className="w-3.5 h-3.5" />
                                <strong>{filterCount}</strong> column filter{filterCount === 1 ? '' : 's'} applied · {filteredImportableCount} importable shown
                            </p>
                            <button
                                onClick={() => { setColumnFilters({}); setOpenFilterColumn(null); }}
                                className="btn-ghost text-xs"
                            >
                                Clear all filters
                            </button>
                        </div>
                    )}

                    {/* Audit-A: tickets we expected as carry-forwards but Jira didn't return */}
                    {missingCarryForwards.length > 0 && (
                        <div className="rounded-xl p-3" style={{ background: '#FFFCEB', border: '1px solid #F5C76A' }}>
                            <div className="flex items-start gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#D3A236' }} />
                                <div className="flex-1">
                                    <p className="text-xs font-semibold" style={{ color: '#8B7020' }}>
                                        {missingCarryForwards.length} expected carry-forward{missingCarryForwards.length === 1 ? '' : 's'} not in Jira's response
                                    </p>
                                    <p className="text-[11px] mt-0.5" style={{ color: '#5A4A1A' }}>
                                        Active in our DB at end of <strong>{previousPeriodLabel}</strong> but not returned by Jira for {period.label} —
                                        may have been resolved out-of-band, deleted, or moved out of scope.
                                    </p>
                                </div>
                            </div>
                            <div className="rounded border bg-white overflow-hidden" style={{ borderColor: '#F5E6A3', maxHeight: 160, overflowY: 'auto' }}>
                                <table className="w-full text-[11px]">
                                    <thead style={{ background: '#FAFBFC', position: 'sticky', top: 0 }}>
                                        <tr>
                                            <th className="px-2 py-1.5 text-left font-semibold uppercase" style={{ color: '#A4A9B6', fontSize: 9 }}>Ticket</th>
                                            <th className="px-2 py-1.5 text-left font-semibold uppercase" style={{ color: '#A4A9B6', fontSize: 9 }}>Summary</th>
                                            <th className="px-2 py-1.5 text-left font-semibold uppercase" style={{ color: '#A4A9B6', fontSize: 9 }}>Assignee</th>
                                            <th className="px-2 py-1.5 text-left font-semibold uppercase" style={{ color: '#A4A9B6', fontSize: 9 }}>First Imported</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {missingCarryForwards.map(t => (
                                            <tr key={t.ticketId} style={{ borderTop: '1px solid #F0E4B8' }}>
                                                <td className="px-2 py-1 font-mono" style={{ color: '#4141A2' }}>{t.ticketId}</td>
                                                <td className="px-2 py-1 max-w-[220px] truncate" style={{ color: '#3F4450' }} title={t.summary || ''}>{t.summary || '—'}</td>
                                                <td className="px-2 py-1" style={{ color: '#717684' }}>{t.assigneeName || '—'}</td>
                                                <td className="px-2 py-1" style={{ color: '#717684' }}>{t.importPeriod || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Bucket pills — filter the table to one source class */}
                    {tickets.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            {([
                                { key: 'all', label: 'All', count: bucketCounts.all, color: '#717684', bg: '#F6F6F9' },
                                { key: 'new', label: 'New in period', count: bucketCounts.new, color: '#21944E', bg: '#EBF5EF' },
                                { key: 'carryForwardMatched', label: 'Carry-forward (matched)', count: bucketCounts.carryForwardMatched, color: '#4141A2', bg: '#F0F0FA' },
                                { key: 'carryForwardUnexpected', label: 'Unexpected carry-forward', count: bucketCounts.carryForwardUnexpected, color: '#A85D00', bg: '#FFF4E0' },
                            ] as const).map(p => {
                                const isActive = bucketFilter === p.key;
                                return (
                                    <button
                                        key={p.key}
                                        onClick={() => setBucketFilter(p.key)}
                                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all"
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
                        </div>
                    )}

                    {/* Dynamic-column table — mirrors /projects/import */}
                    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320, border: '1px solid #E2E4E9', borderRadius: 12 }}>
                        <table className="data-table" style={{ minWidth: customFieldsConfig.length > 4 ? 800 : '100%' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#FFFFFF' }}>
                                <tr>
                                    <th style={{ width: 36 }}>
                                        <input
                                            type="checkbox"
                                            checked={filteredImportableCount > 0 && visibleSelectedCount === filteredImportableCount}
                                            onChange={e => {
                                                if (e.target.checked) {
                                                    const next = new Set(selectedIds);
                                                    filteredTickets.filter(t => t.importable).forEach(t => next.add(t.ticketId));
                                                    setSelectedIds(next);
                                                } else {
                                                    const next = new Set(selectedIds);
                                                    filteredTickets.forEach(t => next.delete(t.ticketId));
                                                    setSelectedIds(next);
                                                }
                                            }}
                                            className="cursor-pointer"
                                        />
                                    </th>
                                    <th style={{ textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Source</th>
                                    {customFieldsConfig.map((col, idx) => {
                                        const isFiltered = columnFilters[col.name] !== undefined;
                                        const uniqueVals = openFilterColumn === col.name ? getUniqueValuesForCol(col.name) : [];
                                        const isLastHalf = idx > customFieldsConfig.length / 2;
                                        return (
                                            <th key={col.id} style={{ textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap' }}>
                                                <div className="flex items-center gap-1">
                                                    {col.name}
                                                    <button
                                                        onClick={() => setOpenFilterColumn(openFilterColumn === col.name ? null : col.name)}
                                                        className="ml-1 p-0.5 rounded transition hover:bg-black/5"
                                                        style={{ color: isFiltered ? '#4141A2' : '#A4A9B6' }}
                                                    >
                                                        <Filter size={11} />
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
                                                            className={`absolute top-full mt-1 w-52 bg-white border rounded shadow-xl p-2 font-normal text-left ${isLastHalf ? 'right-0' : 'left-0'}`}
                                                            style={{ textTransform: 'none', zIndex: 50, borderColor: '#E2E4E9' }}
                                                        >
                                                            <div className="flex justify-between items-center mb-2 pb-2" style={{ borderBottom: '1px solid #E2E4E9' }}>
                                                                <span className="text-xs font-semibold" style={{ color: '#3F4450' }}>Filter {col.name}</span>
                                                                <div className="flex gap-2">
                                                                    <button onClick={() => selectAllFilter(col.name)} className="text-[10px] hover:underline" style={{ color: '#4141A2' }}>All</button>
                                                                    <button onClick={() => clearFilter(col.name)} className="text-[10px] hover:underline" style={{ color: '#717684' }}>Clear</button>
                                                                </div>
                                                            </div>
                                                            <div className="max-h-64 overflow-y-auto space-y-1">
                                                                {dateColumns.has(col.name) ? (() => {
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
                                        : ticket.bucket === 'carryForwardUnexpected'
                                        ? { bg: '#FFF4E0', color: '#A85D00', label: `Unexpected${ticket.originPeriod ? ` · ${ticket.originPeriod}` : ''}` }
                                        : { bg: '#F6F6F9', color: '#717684', label: '—' };
                                    return (
                                    <tr
                                        key={ticket.ticketId}
                                        title={ticket.importable ? '' : ticket.unimportableReasons?.join('\n')}
                                        style={{
                                            background: selectedIds.has(ticket.ticketId) ? '#F8F9FA' : 'transparent',
                                            opacity: ticket.importable ? 1 : 0.5,
                                        }}
                                    >
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(ticket.ticketId)}
                                                    disabled={!ticket.importable}
                                                    onChange={() => setSelectedIds(prev => {
                                                        const n = new Set(prev);
                                                        if (n.has(ticket.ticketId)) n.delete(ticket.ticketId); else n.add(ticket.ticketId);
                                                        return n;
                                                    })}
                                                    className={ticket.importable ? 'cursor-pointer' : 'cursor-not-allowed'}
                                                />
                                                {!ticket.importable && (
                                                    <span
                                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium cursor-help"
                                                        style={{ background: '#FFF5F5', color: '#FA4338' }}
                                                        title={ticket.unimportableReasons?.join('\n')}
                                                    >
                                                        Skip
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap" style={{ background: bucketStyle.bg, color: bucketStyle.color }}>
                                                {ticket.bucket && ticket.bucket !== 'new' && <Clock className="w-2.5 h-2.5" />}
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
                                                            fontSize: 10,
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
                                                <td key={col.id} className="text-xs max-w-[220px] truncate" title={val || ''}>
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

                    <p className="text-[11px]" style={{ color: '#A4A9B6' }}>
                        Columns mirror the standalone Jira import. Click <Filter className="w-3 h-3 inline" /> on any column header to filter values. Only tickets that are <strong>selected and visible</strong> after filtering will be imported. Configure available columns in <a href="/integrations" style={{ color: '#4141A2' }} onClick={(e) => { e.preventDefault(); close(); router.push('/integrations'); }}>Integrations</a>.
                    </p>

                    {error && (
                        <div className="p-3 rounded-lg flex items-start gap-2 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                            <AlertCircle className="w-4 h-4 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E4E9' }}>
                        <button onClick={() => setPhase('review-rules')} className="btn-ghost">
                            <ArrowLeft className="w-4 h-4" /> Back to rules
                        </button>
                        <button onClick={handleImport} className="btn-primary" disabled={importing || visibleSelectedCount === 0}>
                            <Download className="w-4 h-4" /> {importing ? 'Importing…' : `Import ${visibleSelectedCount} ticket${visibleSelectedCount === 1 ? '' : 's'}`}
                        </button>
                    </div>
                </>
            )}

            {/* ── Phase: imported ── */}
            {phase === 'imported' && (
                <>
                    <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: '#EBF5EF', border: '1px solid rgba(33,148,78,0.2)' }}>
                        <CheckSquare className="w-5 h-5" style={{ color: '#21944E' }} />
                        <div>
                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>
                                {importedCount} ticket{importedCount === 1 ? '' : 's'} imported into {period.label}.
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#717684' }}>
                                Move on to generating the journal entry for this period.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E4E9' }}>
                        <button onClick={() => setPhase('preview')} className="btn-ghost">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button onClick={() => goTo('projects')} className="btn-primary">
                            Continue to Project Review <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
