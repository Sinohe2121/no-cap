'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, RotateCcw, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MONTH_NAMES } from '@/lib/periodLabel';

interface ColumnDef {
    id: string;
    name: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onApply: (filters: Record<string, Set<string>>) => void;

    customFieldsConfig: ColumnDef[];
    previewTickets: any[];
    dateColumns: Set<string>;
    cellFilterKey: (colName: string, raw: string) => string;

    // Filter state used to seed the modal — current applied filters take
    // precedence over the prior period's filters when the modal is reopened.
    initialFilters: Record<string, Set<string>>;
    priorFilters: Record<string, string[]> | null;
    priorPeriodLabel: string | null;
}

const MAX_VALUES_IN_MODAL = 50;

export default function ColumnFilterModal({
    open,
    onClose,
    onApply,
    customFieldsConfig,
    previewTickets,
    dateColumns,
    cellFilterKey,
    initialFilters,
    priorFilters,
    priorPeriodLabel,
}: Props) {
    // Per-column unique value lists, keyed off the same cellFilterKey logic
    // the table uses (so the modal stays consistent with how filters apply).
    const valuesByColumn = useMemo(() => {
        const map: Record<string, string[]> = {};
        for (const col of customFieldsConfig) {
            const set = new Set<string>();
            for (const t of previewTickets) {
                const raw = (t.customFields?.[col.name] || '(Blank)').toString();
                set.add(cellFilterKey(col.name, raw));
            }
            map[col.name] = Array.from(set).sort();
        }
        return map;
    }, [customFieldsConfig, previewTickets, cellFilterKey]);

    // Columns that fit in the modal (≤ 50 unique values). High-cardinality
    // columns (Summary, Key, etc.) stay reachable through the per-column
    // header filter on the table.
    const eligibleColumns = useMemo(
        () => customFieldsConfig.filter(c => (valuesByColumn[c.name]?.length ?? 0) <= MAX_VALUES_IN_MODAL),
        [customFieldsConfig, valuesByColumn],
    );
    const hiddenColumns = useMemo(
        () => customFieldsConfig.filter(c => (valuesByColumn[c.name]?.length ?? 0) > MAX_VALUES_IN_MODAL),
        [customFieldsConfig, valuesByColumn],
    );

    // Working selection — Set of *checked* values per column. A column with
    // every value checked = no filter on that column (matches the rest of
    // the page's filter semantics).
    const [selection, setSelection] = useState<Record<string, Set<string>>>({});
    const [expandedColumn, setExpandedColumn] = useState<string | null>(null);

    // Build the prior-period selection (clamped to currently available values)
    // — used both for initial state and the "Reset to prior" button.
    const priorSelection = useMemo<Record<string, Set<string>>>(() => {
        const out: Record<string, Set<string>> = {};
        if (!priorFilters) return out;
        for (const col of eligibleColumns) {
            const allowed = priorFilters[col.name];
            if (!allowed) continue;
            const present = new Set(valuesByColumn[col.name] || []);
            const clamped = allowed.filter(v => present.has(v));
            if (clamped.length > 0 && clamped.length < (valuesByColumn[col.name]?.length ?? 0)) {
                out[col.name] = new Set(clamped);
            }
        }
        return out;
    }, [priorFilters, eligibleColumns, valuesByColumn]);

    // Seed the working selection when the modal opens — preferring any
    // already-applied filters over the prior period's saved filters.
    useEffect(() => {
        if (!open) return;
        const seed: Record<string, Set<string>> = {};
        const source = Object.keys(initialFilters).length > 0 ? initialFilters : priorSelection;
        for (const [col, vals] of Object.entries(source)) {
            seed[col] = new Set(vals);
        }
        setSelection(seed);
        setExpandedColumn(null);
    }, [open, initialFilters, priorSelection]);

    if (!open) return null;

    const isValueChecked = (colName: string, val: string): boolean => {
        const set = selection[colName];
        if (!set) return true; // no entry = no filter = everything checked
        return set.has(val);
    };

    const toggleValue = (colName: string, val: string) => {
        setSelection(prev => {
            const next = { ...prev };
            const all = valuesByColumn[colName] || [];
            const current = new Set(next[colName] || all);
            if (current.has(val)) current.delete(val);
            else current.add(val);
            if (current.size === all.length) delete next[colName];
            else next[colName] = current;
            return next;
        });
    };

    const checkAllInColumn = (colName: string) => {
        setSelection(prev => {
            const next = { ...prev };
            delete next[colName];
            return next;
        });
    };

    const uncheckAllInColumn = (colName: string) => {
        setSelection(prev => ({ ...prev, [colName]: new Set() }));
    };

    const resetToPrior = () => {
        const seed: Record<string, Set<string>> = {};
        for (const [col, vals] of Object.entries(priorSelection)) {
            seed[col] = new Set(vals);
        }
        setSelection(seed);
    };

    const clearAll = () => setSelection({});

    const apply = () => {
        onApply(selection);
        onClose();
    };

    // Tally checked / total per column for the header row
    const tally = (colName: string): { checked: number; total: number } => {
        const total = valuesByColumn[colName]?.length ?? 0;
        const set = selection[colName];
        return { checked: set ? set.size : total, total };
    };

    const monthName = (mm: string) => MONTH_NAMES[parseInt(mm, 10) - 1] ?? mm;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(15, 17, 24, 0.6)' }}
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col"
                style={{ maxHeight: '85vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: '#E2E4E9' }}>
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: '#3F4450' }}>Configure column filters</h2>
                        <p className="text-xs mt-1" style={{ color: '#717684' }}>
                            {priorFilters && Object.keys(priorSelection).length > 0
                                ? <>Pre-filled from <strong>{priorPeriodLabel}</strong> so the included slice stays consistent. Edit, reset, or clear before applying.</>
                                : <>No saved filters from the prior period — start fresh, or click Apply with everything checked to import without filtering.</>}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" style={{ color: '#717684' }}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-2">
                    {eligibleColumns.length === 0 && (
                        <div className="text-center py-8" style={{ color: '#717684' }}>
                            No filterable columns under {MAX_VALUES_IN_MODAL} unique values. Use the column header filters in the table.
                        </div>
                    )}

                    {eligibleColumns.map(col => {
                        const { checked, total } = tally(col.name);
                        const isFiltered = checked < total;
                        const isExpanded = expandedColumn === col.name;
                        const values = valuesByColumn[col.name] || [];
                        const priorActive = !!priorSelection[col.name];

                        return (
                            <div
                                key={col.id}
                                className="border rounded-lg overflow-hidden"
                                style={{ borderColor: isFiltered ? '#4141A2' : '#E2E4E9', background: isFiltered ? '#F9F9FF' : '#FFFFFF' }}
                            >
                                <button
                                    onClick={() => setExpandedColumn(isExpanded ? null : col.name)}
                                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>{col.name}</span>
                                        {priorActive && (
                                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: '#F0F0FA', color: '#4141A2' }}>
                                                from prior
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs" style={{ color: isFiltered ? '#4141A2' : '#717684' }}>
                                        <span className="tabular-nums">{checked} / {total} selected</span>
                                        <span className="text-[10px]">{isExpanded ? '▾' : '▸'}</span>
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="border-t px-4 py-3" style={{ borderColor: '#E2E4E9' }}>
                                        <div className="flex items-center gap-3 mb-2 pb-2 border-b" style={{ borderColor: '#F0F0F4' }}>
                                            <button onClick={() => checkAllInColumn(col.name)} className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline" style={{ color: '#4141A2' }}>
                                                <CheckSquare className="w-3 h-3" /> All
                                            </button>
                                            <button onClick={() => uncheckAllInColumn(col.name)} className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline" style={{ color: '#717684' }}>
                                                <Square className="w-3 h-3" /> None
                                            </button>
                                        </div>
                                        {dateColumns.has(col.name)
                                            ? renderDateTree(values, col.name, isValueChecked, toggleValue, monthName)
                                            : renderFlatList(values, col.name, isValueChecked, toggleValue)}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {hiddenColumns.length > 0 && (
                        <div className="mt-4 p-3 rounded-lg text-[11px]" style={{ background: '#FFFCEB', color: '#5A4A1A', border: '1px solid #F5E6A3' }}>
                            <strong>{hiddenColumns.length} column{hiddenColumns.length === 1 ? '' : 's'} not shown</strong> ({hiddenColumns.map(c => c.name).join(', ')}) — too many unique values to fit here. Use the per-column filter on the table for those.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 p-4 border-t" style={{ borderColor: '#E2E4E9', background: '#FAFBFC' }}>
                    <div className="flex items-center gap-2">
                        {priorFilters && Object.keys(priorSelection).length > 0 && (
                            <button
                                onClick={resetToPrior}
                                className="text-xs font-semibold inline-flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-white"
                                style={{ color: '#4141A2', border: '1px solid #E2E4E9' }}
                            >
                                <RotateCcw className="w-3.5 h-3.5" /> Reset to prior
                            </button>
                        )}
                        <button
                            onClick={clearAll}
                            className="text-xs font-semibold px-3 py-2 rounded-lg hover:bg-white"
                            style={{ color: '#717684', border: '1px solid #E2E4E9' }}
                        >
                            Clear all
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-100"
                            style={{ color: '#717684' }}
                        >
                            Cancel
                        </button>
                        <Button onClick={apply}>Apply filters</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Renderers for the per-column value list ─────────────────────────────
function renderFlatList(
    values: string[],
    colName: string,
    isChecked: (col: string, val: string) => boolean,
    toggle: (col: string, val: string) => void,
) {
    return (
        <div className="space-y-1 max-h-56 overflow-y-auto">
            {values.map(v => (
                <label key={v} className="flex items-start gap-2 text-xs cursor-pointer p-1 hover:bg-gray-50 rounded select-none">
                    <input type="checkbox" className="mt-0.5" checked={isChecked(colName, v)} onChange={() => toggle(colName, v)} />
                    <span className="truncate" style={{ color: v === '(Blank)' ? '#A4A9B6' : '#3F4450', fontStyle: v === '(Blank)' ? 'italic' : 'normal' }} title={v}>{v}</span>
                </label>
            ))}
        </div>
    );
}

function renderDateTree(
    values: string[],
    colName: string,
    isChecked: (col: string, val: string) => boolean,
    toggle: (col: string, val: string) => void,
    monthName: (mm: string) => string,
) {
    const blank = values.includes('(Blank)');
    const dateKeys = values.filter(v => v !== '(Blank)').sort().reverse();
    const byYear: Record<string, string[]> = {};
    for (const ym of dateKeys) {
        const yr = ym.slice(0, 4);
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push(ym);
    }
    const yearKeys = Object.keys(byYear).sort().reverse();
    return (
        <div className="space-y-1 max-h-56 overflow-y-auto">
            {blank && (
                <label className="flex items-start gap-2 text-xs cursor-pointer p-1 hover:bg-gray-50 rounded select-none">
                    <input type="checkbox" className="mt-0.5" checked={isChecked(colName, '(Blank)')} onChange={() => toggle(colName, '(Blank)')} />
                    <span style={{ color: '#A4A9B6', fontStyle: 'italic' }}>(Blank)</span>
                </label>
            )}
            {yearKeys.map(yr => (
                <div key={yr}>
                    <div className="text-xs font-semibold mt-1" style={{ color: '#3F4450' }}>{yr}</div>
                    <div className="ml-3 border-l pl-2" style={{ borderColor: '#E2E4E9' }}>
                        {byYear[yr].map(ym => {
                            const mm = ym.slice(5, 7);
                            return (
                                <label key={ym} className="flex items-center gap-2 text-xs cursor-pointer p-0.5 hover:bg-gray-50 rounded select-none">
                                    <input type="checkbox" checked={isChecked(colName, ym)} onChange={() => toggle(colName, ym)} />
                                    <span style={{ color: '#3F4450' }}>{monthName(mm)}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
