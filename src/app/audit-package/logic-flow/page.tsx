'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, RefreshCw, GitBranch, DollarSign,
    Zap, Pencil, Plus, Trash2, Hash,
} from 'lucide-react';
import styles from './page.module.css';

/* ─── Types ─────────────────────────────────────────────────────── */
interface FlowNode {
    id: string;
    type: 'source' | 'decision' | 'outcome' | 'process';
    label: string;
    description: string;
    phase: 'ingestion' | 'classification' | 'amortization';
    editable: boolean;
    configKey?: string;
    currentValue?: string | boolean;
    options?: { label: string; value: string }[];
    stats?: { ticketCount: number; dollarAmount: number };
    yesTarget?: string;
    noTarget?: string;
    nextTarget?: string;
}

interface CapRule {
    priority: number;
    issueType: string;
    projectStatus: string;
    projectCapitalizable: boolean | null;
    action: string;
}

interface FlowState {
    accountingStandard: string;
    rules: CapRule[];
    amortization: { defaultUsefulLife: number; method: string };
    nodes: FlowNode[];
    stats: {
        totalTicketsThisPeriod: number;
        capitalizedTickets: number;
        expensedTickets: number;
        amortizingTickets: number;
        allocatedAmount: number;
        expensedAmount: number;
        amortizationAmount: number;
    };
}

const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const STANDARD_LABELS: Record<string, string> = {
    ASC_350_40: 'ASC 350-40',
    ASU_2025_06: 'ASU 2025-06',
    IFRS: 'IAS 38 (IFRS)',
};

const ISSUE_TYPES = ['STORY', 'BUG', 'TASK', 'ANY'];
const PROJECT_STATUSES = ['PLANNING', 'DEV', 'LIVE', 'RETIRED', 'ANY'];
const ACTIONS = ['CAPITALIZE', 'EXPENSE'];

/* ─── Component ─────────────────────────────────────────────────── */
export default function LogicFlowPage() {
    const [flow, setFlow] = useState<FlowState | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editingNode, setEditingNode] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [rules, setRules] = useState<CapRule[]>([]);
    const [rulesEdited, setRulesEdited] = useState(false);

    const fetchFlow = useCallback(async () => {
        try {
            const res = await fetch('/api/logic-flow');
            if (!res.ok) throw new Error();
            const data = await res.json();
            setFlow(data);
            setRules(data.rules);
        } catch {
            console.error('Failed to load logic flow');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchFlow(); }, [fetchFlow]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchFlow();
    };

    const handleNodeEdit = (node: FlowNode) => {
        if (!node.editable || !node.options) return;
        setEditingNode(node.id);
        setEditValue(String(node.currentValue));
    };

    const handleSaveNodeEdit = async (node: FlowNode) => {
        if (!node.configKey) return;
        setSaving(true);
        try {
            // Save to GlobalConfig
            await fetch('/api/admin/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'config',
                    key: node.configKey,
                    value: editValue,
                    label: node.label,
                }),
            });
            setEditingNode(null);
            await fetchFlow();
        } catch {
            console.error('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    // ── Rule editing ──
    const handleRuleChange = (index: number, field: keyof CapRule, value: string) => {
        const updated = [...rules];
        if (field === 'projectCapitalizable') {
            updated[index] = { ...updated[index], [field]: value === 'true' ? true : value === 'false' ? false : null };
        } else if (field === 'priority') {
            updated[index] = { ...updated[index], [field]: parseInt(value) };
        } else {
            updated[index] = { ...updated[index], [field]: value };
        }
        setRules(updated);
        setRulesEdited(true);
    };

    const handleAddRule = () => {
        const maxPriority = rules.length > 0 ? Math.max(...rules.map(r => r.priority)) : 0;
        setRules([...rules, {
            priority: maxPriority + 1,
            issueType: 'ANY',
            projectStatus: 'ANY',
            projectCapitalizable: null,
            action: 'EXPENSE',
        }]);
        setRulesEdited(true);
    };

    const handleDeleteRule = (index: number) => {
        setRules(rules.filter((_, i) => i !== index));
        setRulesEdited(true);
    };

    const handleSaveRules = async () => {
        setSaving(true);
        try {
            await fetch('/api/rules', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rules),
            });
            setRulesEdited(false);
            await fetchFlow();
        } catch {
            console.error('Failed to save rules');
        } finally {
            setSaving(false);
        }
    };

    // ── Render helpers ──
    const getOutcomeClass = (node: FlowNode) => {
        if (node.label === 'CAPITALIZE') return styles.capitalize;
        if (node.label === 'EXPENSE') return styles.expense;
        if (node.label === 'AMORTIZATION EXPENSE') return styles.amortize;
        if (node.label.includes('Hold')) return styles.hold;
        return '';
    };

    const renderNode = (node: FlowNode) => {
        const isEditing = editingNode === node.id;

        return (
            <div
                key={node.id}
                className={`${styles.node} ${styles[node.type]} ${node.editable ? styles.editable : ''} ${getOutcomeClass(node)}`}
                onClick={() => node.editable && !isEditing && handleNodeEdit(node)}
            >
                <div className={styles.nodeLabel}>
                    {node.type === 'source' && <GitBranch size={13} />}
                    {node.type === 'process' && <Zap size={13} />}
                    {node.type === 'decision' && <Hash size={13} />}
                    {node.type === 'outcome' && <DollarSign size={13} />}
                    {node.label}
                    {node.editable && (
                        <span className={styles.editBadge}>
                            <Pencil size={9} /> Editable
                        </span>
                    )}
                </div>
                <div className={styles.nodeDesc}>{node.description}</div>

                {node.type === 'decision' && (
                    <div className={styles.branches}>
                        <span className={`${styles.branchLabel} ${styles.yes}`}>→ Yes</span>
                        <span className={`${styles.branchLabel} ${styles.no}`}>→ No</span>
                    </div>
                )}

                {node.stats && (node.stats.ticketCount > 0 || node.stats.dollarAmount > 0) && (
                    <div className={styles.nodeStats}>
                        {node.stats.ticketCount > 0 && (
                            <span className={styles.statChip}>
                                {node.stats.ticketCount.toLocaleString()} tickets
                            </span>
                        )}
                        {node.stats.dollarAmount > 0 && (
                            <span className={styles.statChip}>
                                {fmt(node.stats.dollarAmount)}
                            </span>
                        )}
                    </div>
                )}

                {/* Edit panel */}
                {isEditing && node.options && (
                    <div className={styles.editPanel} onClick={(e) => e.stopPropagation()}>
                        <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                        >
                            {node.options.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <div className={styles.editActions}>
                            <button className={styles.cancelBtn} onClick={() => setEditingNode(null)}>
                                Cancel
                            </button>
                            <button
                                className={styles.saveBtn}
                                onClick={() => handleSaveNodeEdit(node)}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Apply'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <span className={styles.loadingDot} />
                    Loading logic flow...
                </div>
            </div>
        );
    }

    if (!flow) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>Failed to load logic flow. Please refresh.</div>
            </div>
        );
    }

    const phaseNodes = {
        ingestion: flow.nodes.filter(n => n.phase === 'ingestion'),
        classification: flow.nodes.filter(n => n.phase === 'classification'),
        amortization: flow.nodes.filter(n => n.phase === 'amortization'),
    };

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <Link href="/audit-package" className={styles.backLink}>
                    <ArrowLeft size={14} /> Audit Package
                </Link>
                <div className={styles.titleRow}>
                    <div>
                        <h1 className={styles.title}>Logic Flow — Capitalization Engine</h1>
                        <p className={styles.subtitle}>
                            Visual map of how costs are classified. Editable nodes affect future journal entries only.
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className={styles.standardBadge}>
                            {STANDARD_LABELS[flow.accountingStandard] || flow.accountingStandard}
                        </span>
                        <button
                            className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ''}`}
                            onClick={handleRefresh}
                        >
                            <RefreshCw size={13} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary strip */}
            <div className={styles.summaryStrip}>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Active Tickets</div>
                    <div className={styles.summaryValue}>
                        {flow.stats.totalTicketsThisPeriod.toLocaleString()}
                    </div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Capitalized</div>
                    <div className={`${styles.summaryValue} ${styles.capitalize}`}>
                        {fmt(flow.stats.allocatedAmount)}
                    </div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Expensed</div>
                    <div className={`${styles.summaryValue} ${styles.expense}`}>
                        {fmt(flow.stats.expensedAmount)}
                    </div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Amortization</div>
                    <div className={`${styles.summaryValue} ${styles.amortize}`}>
                        {fmt(flow.stats.amortizationAmount)}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className={styles.legend}>
                <span className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.source}`} /> Data Source
                </span>
                <span className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.process}`} /> Process
                </span>
                <span className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.decision}`} /> Decision
                </span>
                <span className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.outcome}`} /> Outcome
                </span>
            </div>

            {/* Flowchart */}
            <div className={styles.flowchart}>
                {/* Phase 1: Ingestion */}
                <div className={styles.phase}>
                    <div className={styles.phaseHeader}>
                        <span className={styles.phaseNumber}>1</span>
                        Ingestion &amp; Cost Loading
                    </div>
                    <div className={styles.nodeList}>
                        {phaseNodes.ingestion.map((node, i) => (
                            <div key={node.id} style={{ width: '100%' }}>
                                {renderNode(node)}
                                {i < phaseNodes.ingestion.length - 1 && (
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <div className={styles.connector} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Phase 2: Classification */}
                <div className={styles.phase}>
                    <div className={styles.phaseHeader}>
                        <span className={styles.phaseNumber}>2</span>
                        Classification Engine
                    </div>
                    <div className={styles.nodeList}>
                        {phaseNodes.classification.map((node, i) => (
                            <div key={node.id} style={{ width: '100%' }}>
                                {renderNode(node)}
                                {i < phaseNodes.classification.length - 1 && (
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <div className={styles.connector} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Phase 3: Amortization */}
                <div className={styles.phase}>
                    <div className={styles.phaseHeader}>
                        <span className={styles.phaseNumber}>3</span>
                        Post-Resolution &amp; Amortization
                    </div>
                    <div className={styles.nodeList}>
                        {phaseNodes.amortization.map((node, i) => (
                            <div key={node.id} style={{ width: '100%' }}>
                                {renderNode(node)}
                                {i < phaseNodes.amortization.length - 1 && (
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <div className={styles.connector} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Rules table */}
            <div className={styles.rulesSection}>
                <div className={styles.rulesHeader}>
                    <span className={styles.rulesTitle}>Classification Rules (Priority Order)</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {rulesEdited && (
                            <button className={styles.saveBtn} style={{ fontSize: 11, padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={handleSaveRules} disabled={saving}>
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        )}
                        <button className={styles.addRuleBtn} onClick={handleAddRule}>
                            <Plus size={12} /> Add Rule
                        </button>
                    </div>
                </div>

                <table className={styles.rulesTable}>
                    <thead>
                        <tr>
                            <th>Priority</th>
                            <th>Issue Type</th>
                            <th>Project Status</th>
                            <th>Capitalizable</th>
                            <th>Action</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rules.map((rule, i) => (
                            <tr key={i}>
                                <td>
                                    <input
                                        type="number"
                                        value={rule.priority}
                                        onChange={(e) => handleRuleChange(i, 'priority', e.target.value)}
                                        style={{ width: 50, padding: '4px 6px', fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 4, fontWeight: 700, textAlign: 'center' }}
                                        min={1}
                                    />
                                </td>
                                <td>
                                    <select className={styles.ruleSelect} value={rule.issueType} onChange={(e) => handleRuleChange(i, 'issueType', e.target.value)}>
                                        {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <select className={styles.ruleSelect} value={rule.projectStatus} onChange={(e) => handleRuleChange(i, 'projectStatus', e.target.value)}>
                                        {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <select className={styles.ruleSelect} value={rule.projectCapitalizable === null ? 'any' : String(rule.projectCapitalizable)} onChange={(e) => handleRuleChange(i, 'projectCapitalizable', e.target.value === 'any' ? 'null' : e.target.value)}>
                                        <option value="any">Any</option>
                                        <option value="true">Yes</option>
                                        <option value="false">No</option>
                                    </select>
                                </td>
                                <td>
                                    <select className={styles.ruleSelect} value={rule.action} onChange={(e) => handleRuleChange(i, 'action', e.target.value)}>
                                        {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <button className={styles.deleteRuleBtn} onClick={() => handleDeleteRule(i)} title="Remove rule">
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
