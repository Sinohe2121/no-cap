'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle, Save, FolderKanban, Info, RefreshCw } from 'lucide-react';
import { useWizard } from '@/context/WizardContext';

interface PeriodProject {
    project: {
        id: string;
        name: string;
        epicKey: string;
        status: string;
        isCapitalizable: boolean;
        mgmtAuthorized: boolean;
        probableToComplete: boolean;
    };
    counts: {
        total: number;
        story: number;
        bug: number;
        task: number;
        epic: number;
        subtask: number;
        other: number;
    };
    preview: { capitalize: number; expense: number };
}

interface ProjectEdits {
    status?: string;
    isCapitalizable?: boolean;
    mgmtAuthorized?: boolean;
    probableToComplete?: boolean;
}

const STATUSES = ['PLANNING', 'DEV', 'LIVE', 'RETIRED'] as const;

export default function Step3Projects() {
    const { period, goTo, markCompleted } = useWizard();
    const [data, setData] = useState<PeriodProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [reloadKey, setReloadKey] = useState(0);
    const [edits, setEdits] = useState<Record<string, ProjectEdits>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!period) return;
        setLoading(true);
        fetch(`/api/wizard/period-projects?month=${period.month}&year=${period.year}`)
            .then(r => r.ok ? r.json() : [])
            .then(d => setData(Array.isArray(d) ? d : []))
            .catch(() => setData([]))
            .finally(() => setLoading(false));
    }, [period, reloadKey]);

    const dirtyCount = Object.keys(edits).length;

    if (!period) {
        return (
            <div className="rounded-xl p-4 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                No period selected. Go back to Step 1.
            </div>
        );
    }

    /** Effective value after the user's edits, falling back to the persisted DB value. */
    function effective(p: PeriodProject) {
        const e = edits[p.project.id] || {};
        return {
            status: e.status ?? p.project.status,
            isCapitalizable: e.isCapitalizable ?? p.project.isCapitalizable,
            mgmtAuthorized: e.mgmtAuthorized ?? p.project.mgmtAuthorized,
            probableToComplete: e.probableToComplete ?? p.project.probableToComplete,
        };
    }

    const updateProject = (id: string, patch: ProjectEdits) => {
        setEdits(prev => {
            const next = { ...prev };
            const merged = { ...(next[id] || {}), ...patch };
            // If every edited value matches the original, remove from edits
            const orig = data.find(d => d.project.id === id)?.project;
            if (orig
                && (merged.status === undefined || merged.status === orig.status)
                && (merged.isCapitalizable === undefined || merged.isCapitalizable === orig.isCapitalizable)
                && (merged.mgmtAuthorized === undefined || merged.mgmtAuthorized === orig.mgmtAuthorized)
                && (merged.probableToComplete === undefined || merged.probableToComplete === orig.probableToComplete)) {
                delete next[id];
            } else {
                next[id] = merged;
            }
            return next;
        });
    };

    const saveAll = async () => {
        setSaving(true);
        setError(null);
        try {
            for (const [id, patch] of Object.entries(edits)) {
                const res = await fetch('/api/projects', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, ...patch }),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || `Failed saving ${id}`);
                }
            }
            setEdits({});
            // Re-fetch with updated rule predictions
            setReloadKey(k => k + 1);
            markCompleted('projects');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const continueToJournal = async () => {
        if (dirtyCount > 0) {
            await saveAll();
            // Don't auto-advance after first save — let user verify the new previews
            return;
        }
        markCompleted('projects');
        goTo('journal');
    };

    const totals = useMemo(() => {
        let projects = data.length;
        let tickets = 0;
        let willCap = 0;
        let willExp = 0;
        for (const d of data) {
            tickets += d.counts.total;
            // Recompute preview from edits — coarse proxy: keep DB preview for now
            willCap += d.preview.capitalize;
            willExp += d.preview.expense;
        }
        return { projects, tickets, willCap, willExp };
    }, [data]);

    return (
        <div className="space-y-5">
            {/* Period banner */}
            <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#F0F0FA', border: '1px solid rgba(65,65,162,0.15)' }}>
                <FolderKanban className="w-4 h-4" style={{ color: '#4141A2' }} />
                <p className="text-xs" style={{ color: '#3F4450' }}>
                    Reviewing the <strong>{totals.projects} project{totals.projects === 1 ? '' : 's'}</strong> with tickets
                    in <strong style={{ color: '#4141A2' }}>{period.label}</strong>. Set each project&apos;s
                    status and capitalization flags so the journal entry classifies correctly.
                </p>
            </div>

            {/* Inline classification reminder */}
            <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: '#FFFCEB', border: '1px solid #F5E6A3', color: '#5A4A1A' }}>
                <p>
                    <Info className="w-3.5 h-3.5 inline mr-1" />
                    The default rules capitalize <strong>STORY</strong> tickets only on projects that are
                    <strong> capitalizable</strong> AND in <strong>DEV</strong> status. PLANNING / LIVE / RETIRED
                    projects fall through to EXPENSE unless you change the rules.
                </p>
            </div>

            {loading && (
                <p className="text-sm" style={{ color: '#717684' }}>Loading projects…</p>
            )}

            {!loading && data.length === 0 && (
                <div className="rounded-xl p-6 text-center text-sm" style={{ background: '#F6F6F9', color: '#717684' }}>
                    No projects with tickets in this period. Step 2 may not have imported anything yet.
                </div>
            )}

            {!loading && data.length > 0 && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9' }}>
                    <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                        <table className="w-full text-xs">
                            <thead style={{ position: 'sticky', top: 0, background: '#F6F6F9', zIndex: 1 }}>
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>PROJECT</th>
                                    <th className="px-3 py-2 text-left font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>STATUS</th>
                                    <th className="px-3 py-2 text-center font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>CAP?</th>
                                    <th className="px-3 py-2 text-center font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>MGMT AUTH</th>
                                    <th className="px-3 py-2 text-center font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>PROBABLE</th>
                                    <th className="px-3 py-2 text-right font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>TICKETS</th>
                                    <th className="px-3 py-2 text-right font-semibold" style={{ color: '#A4A9B6', fontSize: 10 }}>CURRENT PREVIEW</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((d) => {
                                    const eff = effective(d);
                                    const isDirty = !!edits[d.project.id];
                                    return (
                                        <tr
                                            key={d.project.id}
                                            style={{
                                                borderTop: '1px solid #E2E4E9',
                                                background: isDirty ? '#FFFCEB' : 'transparent',
                                            }}
                                        >
                                            <td className="px-3 py-2">
                                                <p className="font-semibold" style={{ color: '#3F4450' }}>{d.project.name}</p>
                                                <p className="text-[10px] font-mono" style={{ color: '#A4A9B6' }}>{d.project.epicKey}</p>
                                            </td>
                                            <td className="px-3 py-2">
                                                <select
                                                    value={eff.status}
                                                    onChange={(e) => updateProject(d.project.id, { status: e.target.value })}
                                                    className="form-select text-xs"
                                                    style={{ minWidth: 110, padding: '4px 24px 4px 8px', fontSize: 11 }}
                                                >
                                                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <ToggleCell
                                                    on={eff.isCapitalizable}
                                                    onChange={(v) => updateProject(d.project.id, { isCapitalizable: v })}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <ToggleCell
                                                    on={eff.mgmtAuthorized}
                                                    onChange={(v) => updateProject(d.project.id, { mgmtAuthorized: v })}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <ToggleCell
                                                    on={eff.probableToComplete}
                                                    onChange={(v) => updateProject(d.project.id, { probableToComplete: v })}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: '#3F4450' }}>
                                                <span className="font-semibold">{d.counts.total}</span>
                                                <p className="text-[10px]" style={{ color: '#A4A9B6' }}>
                                                    {d.counts.story} story · {d.counts.bug} bug · {d.counts.task} task
                                                </p>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <div className="flex flex-col items-end gap-0.5">
                                                    {d.preview.capitalize > 0 && (
                                                        <span className="badge" style={{ background: '#EBF5EF', color: '#21944E', fontSize: 10 }}>
                                                            {d.preview.capitalize} CAP
                                                        </span>
                                                    )}
                                                    {d.preview.expense > 0 && (
                                                        <span className="badge" style={{ background: '#FFF5F5', color: '#FA4338', fontSize: 10 }}>
                                                            {d.preview.expense} EXP
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!loading && data.length > 0 && (
                <p className="text-[11px]" style={{ color: '#A4A9B6' }}>
                    The CAP / EXP preview reflects the rules currently saved + the project values <strong>last saved to the database</strong>.
                    To see updated previews after editing, click <strong>Save changes</strong> below — that will refresh the predictions before
                    you continue to the journal entry.
                </p>
            )}

            {error && (
                <div className="p-3 rounded-lg flex items-start gap-2 text-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                    <AlertCircle className="w-4 h-4 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E4E9' }}>
                <button onClick={() => goTo('jira')} className="btn-ghost">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <div className="flex items-center gap-2">
                    {dirtyCount > 0 && (
                        <button
                            onClick={saveAll}
                            disabled={saving}
                            className="btn-secondary"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? 'Saving…' : `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`}
                        </button>
                    )}
                    <button
                        onClick={continueToJournal}
                        disabled={saving}
                        className="btn-primary"
                    >
                        {dirtyCount > 0
                            ? <><RefreshCw className="w-4 h-4" /> Save & Refresh Preview</>
                            : <>Continue to Journal Entry <ArrowRight className="w-4 h-4" /></>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

function ToggleCell({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!on)}
            className="relative w-9 h-5 rounded-full"
            style={{
                background: on ? '#21944E' : '#E2E4E9',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s',
                display: 'inline-flex',
                alignItems: 'center',
            }}
            aria-pressed={on}
        >
            <span
                style={{
                    position: 'absolute',
                    top: 2,
                    left: on ? 20 : 2,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    transition: 'left 0.15s',
                }}
            />
        </button>
    );
}
