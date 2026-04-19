'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, ListFilter, Loader2, Plus, Trash2,
    ArrowUp, ArrowDown, GripVertical, RotateCcw, CheckCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CapRule {
    priority: number;
    issueType: string;
    projectStatus: string;
    projectCapitalizable: boolean | null;
    action: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function actionBadge(action: string) {
    if (action === 'CAPITALIZE') return { bg: '#EBF5EF', color: '#21944E' };
    if (action === 'EXPENSE') return { bg: '#FFF5F5', color: '#FA4338' };
    return { bg: '#F6F6F9', color: '#717684' };
}

const ISSUE_TYPES = ['STORY', 'BUG', 'TASK', 'EPIC', 'SUBTASK', 'ANY'];
const PROJECT_STATUSES = ['PLANNING', 'DEV', 'LIVE', 'RETIRED', 'ANY'];
const CAP_OPTIONS = [
    { value: 'true', label: 'Yes (capitalizable only)' },
    { value: 'false', label: 'No (non-capitalizable only)' },
    { value: 'null', label: 'Any' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ClassificationRulesPage() {
    const [rules, setRules]               = useState<CapRule[]>([]);
    const [rulesLoading, setRulesLoading] = useState(true);
    const [rulesSaving, setRulesSaving]   = useState(false);
    const [rulesSaved, setRulesSaved]     = useState(false);
    const [newRule, setNewRule] = useState<CapRule>({
        priority: 99, issueType: 'STORY', projectStatus: 'DEV',
        projectCapitalizable: true, action: 'CAPITALIZE',
    });

    useEffect(() => {
        fetch('/api/rules')
            .then(r => r.ok ? r.json() : [])
            .then(data => setRules(Array.isArray(data) ? data : []))
            .finally(() => setRulesLoading(false));
    }, []);

    const saveRules = async () => {
        setRulesSaving(true);
        setRulesSaved(false);
        try {
            const ranked = rules.map((r, i) => ({ ...r, priority: i + 1 }));
            await fetch('/api/rules', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ranked),
            });
            setRules(ranked);
            setRulesSaved(true);
            setTimeout(() => setRulesSaved(false), 2000);
        } finally {
            setRulesSaving(false);
        }
    };

    const resetRules = async () => {
        setRulesLoading(true);
        const data = await fetch('/api/rules', { method: 'DELETE' }).then(r => r.ok ? r.json() : []);
        setRules(Array.isArray(data) ? data : []);
        setRulesLoading(false);
    };

    const addRule  = () => setRules([...rules, { ...newRule, priority: rules.length + 1 }]);
    const removeRule = (index: number) => setRules(rules.filter((_, i) => i !== index));
    const moveRule = (index: number, dir: -1 | 1) => {
        const next   = [...rules];
        const target = index + dir;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setRules(next);
    };

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
                    <h1 className="section-header flex items-center gap-2">
                        <ListFilter className="w-5 h-5" style={{ color: '#4141A2' }} />
                        Classification Rules
                    </h1>
                    <p className="section-subtext">Priority-ordered rules that determine how each ticket is classified for capitalization</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={resetRules} className="btn-ghost text-xs" style={{ color: '#A4A9B6' }}>
                        <RotateCcw className="w-3.5 h-3.5" /> Reset to Defaults
                    </button>
                    <button onClick={saveRules} disabled={rulesSaving} className="btn-primary">
                        {rulesSaved ? <><CheckCircle className="w-4 h-4" /> Saved</> : 'Save Rules'}
                    </button>
                </div>
            </div>

            {/* Info banner */}
            <div className="rounded-xl p-4 mb-6" style={{ background: '#F5F3FF', border: '1px solid rgba(65,65,162,0.15)' }}>
                <p className="text-xs" style={{ color: '#717684' }}>
                    Rules are evaluated in priority order (top to bottom). The <strong>first matching rule</strong> wins.
                    Unmatched tickets default to <span className="font-medium" style={{ color: '#FA4338' }}>EXPENSE</span>.
                </p>
            </div>

            {/* Rules table */}
            <div className="glass-card mb-6" style={{ overflow: 'hidden' }}>
                {rulesLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#A4A9B6' }} />
                    </div>
                ) : (
                    <table className="w-full text-xs">
                        <thead>
                            <tr style={{ background: '#F6F6F9', borderBottom: '2px solid #E2E4E9' }}>
                                <th className="px-4 py-3 text-left w-10" style={{ color: '#A4A9B6' }}>#</th>
                                <th className="px-4 py-3 text-left" style={{ color: '#A4A9B6' }}>ISSUE TYPE</th>
                                <th className="px-4 py-3 text-left" style={{ color: '#A4A9B6' }}>PROJECT STATUS</th>
                                <th className="px-4 py-3 text-left" style={{ color: '#A4A9B6' }}>CAPITALIZABLE</th>
                                <th className="px-4 py-3 text-left" style={{ color: '#A4A9B6' }}>ACTION</th>
                                <th className="px-4 py-3 text-right" style={{ color: '#A4A9B6' }}>REORDER</th>
                                <th className="px-4 py-3 w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map((rule, i) => {
                                const badge = actionBadge(rule.action);
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid #E2E4E9' }}>
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-1.5">
                                                <GripVertical className="w-3.5 h-3.5" style={{ color: '#D3D5DB' }} />
                                                <span className="font-semibold tabular-nums" style={{ color: '#A4A9B6' }}>{i + 1}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className="badge" style={{ background: '#F6F6F9', color: '#3F4450', fontFamily: 'monospace' }}>{rule.issueType}</span>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className="badge" style={{ background: '#F6F6F9', color: '#3F4450' }}>{rule.projectStatus}</span>
                                        </td>
                                        <td className="px-4 py-3.5" style={{ color: '#717684' }}>
                                            {rule.projectCapitalizable === null ? 'Any' : rule.projectCapitalizable ? 'Yes' : 'No'}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className="badge font-semibold" style={{ background: badge.bg, color: badge.color }}>{rule.action}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-right">
                                            <div className="flex items-center justify-end gap-0.5">
                                                <button onClick={() => moveRule(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                                                    <ArrowUp className="w-3 h-3" style={{ color: '#717684' }} />
                                                </button>
                                                <button onClick={() => moveRule(i, 1)} disabled={i === rules.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                                                    <ArrowDown className="w-3 h-3" style={{ color: '#717684' }} />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <button onClick={() => removeRule(i)} className="p-1 rounded hover:bg-red-50">
                                                <Trash2 className="w-3.5 h-3.5" style={{ color: '#FA4338' }} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Rule Form */}
            <div className="glass-card p-5">
                <p className="text-xs font-semibold mb-4" style={{ color: '#3F4450' }}>Add New Rule</p>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Issue Type</label>
                        <select value={newRule.issueType} onChange={e => setNewRule({ ...newRule, issueType: e.target.value })} className="form-select" style={{ width: 110 }}>
                            {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Project Status</label>
                        <select value={newRule.projectStatus} onChange={e => setNewRule({ ...newRule, projectStatus: e.target.value })} className="form-select" style={{ width: 120 }}>
                            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Capitalizable?</label>
                        <select
                            value={newRule.projectCapitalizable === null ? 'null' : newRule.projectCapitalizable ? 'true' : 'false'}
                            onChange={e => setNewRule({ ...newRule, projectCapitalizable: e.target.value === 'null' ? null : e.target.value === 'true' })}
                            className="form-select"
                            style={{ width: 160 }}
                        >
                            {CAP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Action</label>
                        <select value={newRule.action} onChange={e => setNewRule({ ...newRule, action: e.target.value })} className="form-select" style={{ width: 130 }}>
                            <option value="CAPITALIZE">CAPITALIZE</option>
                            <option value="EXPENSE">EXPENSE</option>
                        </select>
                    </div>
                    <button onClick={addRule} className="btn-primary">
                        <Plus className="w-4 h-4" /> Add Rule
                    </button>
                </div>
            </div>
        </div>
    );
}
