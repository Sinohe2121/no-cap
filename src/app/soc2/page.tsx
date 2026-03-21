'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Shield, CheckCircle, AlertTriangle, Clock, Plus, ChevronDown, ChevronRight,
    ExternalLink, Trash2, XCircle, Activity, FileText, BarChart3, Zap, ArrowLeft
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Soc2Evidence {
    id: string; title: string; description?: string; url?: string;
    reviewer?: string; reviewedAt?: string | null; isVerified: boolean; createdAt: string;
}

interface Soc2Control {
    id: string; criterion: string; controlId: string; title: string;
    description: string; owner?: string | null; frequency: string;
    status: string; dueDate?: string | null; notes?: string | null;
    evidenceCount: number; verifiedCount: number; score: number;
    evidence: Soc2Evidence[];
}

interface ByCriterion { criterion: string; score: number; total: number; compliant: number; }

interface Soc2RiskItem {
    id: string; title: string; description?: string | null; criterion?: string | null;
    likelihood: number; impact: number; owner?: string | null;
    mitigation?: string | null; status: string; createdAt: string;
}

interface Soc2Incident {
    id: string; title: string; incidentType: string; severity: string;
    occurredAt: string; resolvedAt?: string | null; durationMins?: number | null;
    description?: string | null; rootCause?: string | null;
    remediation?: string | null; reportedBy?: string | null;
    isResolved: boolean; createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CRITERION_META: Record<string, { label: string; color: string; bg: string }> = {
    CC6: { label: 'CC6 — Access Control', color: '#4141A2', bg: '#F0EAF8' },
    CC7: { label: 'CC7 — Change Mgmt', color: '#D3A236', bg: '#FEF9ED' },
    CC2: { label: 'CC2 — Communication', color: '#21944E', bg: '#EBF5EF' },
    A1:  { label: 'A1 — Availability', color: '#0E7490', bg: '#E0F7FA' },
    CC3: { label: 'CC3 — Risk Assessment', color: '#FA4338', bg: '#FFF5F5' },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    COMPLIANT:    { label: 'Compliant',    color: '#21944E', bg: '#EBF5EF' },
    IN_PROGRESS:  { label: 'In Progress',  color: '#D3A236', bg: '#FEF9ED' },
    AT_RISK:      { label: 'At Risk',      color: '#FA4338', bg: '#FFF5F5' },
    NOT_STARTED:  { label: 'Not Started',  color: '#A4A9B6', bg: '#F6F6F9' },
};

const LIKELIHOOD_LABELS = ['', 'Rare', 'Unlikely', 'Possible', 'Likely'];
const IMPACT_LABELS = ['', 'Low', 'Medium', 'High', 'Critical'];
const SEVERITY_META: Record<string, { color: string; bg: string }> = {
    LOW:      { color: '#21944E', bg: '#EBF5EF' },
    MEDIUM:   { color: '#D3A236', bg: '#FEF9ED' },
    HIGH:     { color: '#FA4338', bg: '#FFF5F5' },
    CRITICAL: { color: '#fff',    bg: '#FA4338' },
};

function riskScore(l: number, i: number) { return l * i; }
function riskLevel(score: number) {
    if (score >= 12) return { label: 'Critical', color: '#FA4338' };
    if (score >= 8) return { label: 'High', color: '#F97316' };
    if (score >= 4) return { label: 'Medium', color: '#D3A236' };
    return { label: 'Low', color: '#21944E' };
}

function ScoreRing({ score }: { score: number }) {
    const r = 52;
    const circ = 2 * Math.PI * r;
    const dash = (score / 100) * circ;
    const color = score >= 80 ? '#21944E' : score >= 60 ? '#D3A236' : '#FA4338';
    return (
        <svg width="128" height="128" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r={r} fill="none" stroke="#E2E4E9" strokeWidth="10" />
            <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10"
                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                transform="rotate(-90 64 64)" style={{ transition: 'stroke-dasharray 1s ease' }} />
            <text x="64" y="60" textAnchor="middle" fontSize="26" fontWeight="700" fill={color}>{score}</text>
            <text x="64" y="76" textAnchor="middle" fontSize="10" fill="#A4A9B6">/ 100</text>
        </svg>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Soc2Page() {
    const [activeTab, setActiveTab] = useState<'overview' | 'controls' | 'risks' | 'incidents'>('overview');
    const [controls, setControls] = useState<Soc2Control[]>([]);
    const [overallScore, setOverallScore] = useState(0);
    const [byCriterion, setByCriterion] = useState<ByCriterion[]>([]);
    const [risks, setRisks] = useState<Soc2RiskItem[]>([]);
    const [incidents, setIncidents] = useState<Soc2Incident[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedControl, setExpandedControl] = useState<string | null>(null);
    const [filterCriterion, setFilterCriterion] = useState('ALL');

    // Evidence form state
    const [evForm, setEvForm] = useState({ title: '', url: '', description: '', reviewer: '' });
    const [addingEvFor, setAddingEvFor] = useState<string | null>(null);
    const [evSaving, setEvSaving] = useState(false);

    // Risk form
    const [showRiskForm, setShowRiskForm] = useState(false);
    const [riskForm, setRiskForm] = useState({ title: '', description: '', criterion: 'CC6', likelihood: 2, impact: 2, owner: '', mitigation: '', status: 'OPEN' });
    const [riskSaving, setRiskSaving] = useState(false);

    // Incident form
    const [showIncForm, setShowIncForm] = useState(false);
    const [incForm, setIncForm] = useState({ title: '', incidentType: 'AVAILABILITY', severity: 'LOW', occurredAt: '', description: '', reportedBy: '', rootCause: '', remediation: '' });
    const [incSaving, setIncSaving] = useState(false);

    const loadAll = async () => {
        setLoading(true);
        const [ctrlRes, riskRes, incRes] = await Promise.all([
            fetch('/api/soc2/controls').then((r) => r.json()),
            fetch('/api/soc2/risks').then((r) => r.json()),
            fetch('/api/soc2/incidents').then((r) => r.json()),
        ]);
        setControls(ctrlRes.controls || []);
        setOverallScore(ctrlRes.overallScore || 0);
        setByCriterion(ctrlRes.byCriterion || []);
        setRisks(riskRes.risks || []);
        setIncidents(incRes.incidents || []);
        setLoading(false);
    };

    useEffect(() => { loadAll(); }, []);

    const updateControlStatus = async (id: string, status: string) => {
        await fetch('/api/soc2/controls', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
        setControls((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
    };

    const addEvidence = async (controlId: string) => {
        setEvSaving(true);
        await fetch('/api/soc2/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ controlId, ...evForm }) });
        setEvForm({ title: '', url: '', description: '', reviewer: '' });
        setAddingEvFor(null);
        setEvSaving(false);
        await loadAll();
    };

    const verifyEvidence = async (id: string, isVerified: boolean) => {
        await fetch('/api/soc2/evidence', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, isVerified }) });
        await loadAll();
    };

    const deleteEvidence = async (id: string) => {
        await fetch('/api/soc2/evidence', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        await loadAll();
    };

    const addRisk = async () => {
        setRiskSaving(true);
        await fetch('/api/soc2/risks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(riskForm) });
        setShowRiskForm(false);
        setRiskForm({ title: '', description: '', criterion: 'CC6', likelihood: 2, impact: 2, owner: '', mitigation: '', status: 'OPEN' });
        setRiskSaving(false);
        const r = await fetch('/api/soc2/risks').then((r) => r.json());
        setRisks(r.risks || []);
    };

    const updateRiskStatus = async (id: string, status: string) => {
        await fetch('/api/soc2/risks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
        setRisks((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    };

    const addIncident = async () => {
        setIncSaving(true);
        await fetch('/api/soc2/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...incForm, occurredAt: new Date(incForm.occurredAt).toISOString() }) });
        setShowIncForm(false);
        setIncForm({ title: '', incidentType: 'AVAILABILITY', severity: 'LOW', occurredAt: '', description: '', reportedBy: '', rootCause: '', remediation: '' });
        setIncSaving(false);
        const r = await fetch('/api/soc2/incidents').then((r) => r.json());
        setIncidents(r.incidents || []);
    };

    const resolveIncident = async (id: string) => {
        await fetch('/api/soc2/incidents', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, isResolved: true }) });
        setIncidents((prev) => prev.map((i) => i.id === id ? { ...i, isResolved: true, resolvedAt: new Date().toISOString() } : i));
    };

    const filteredControls = filterCriterion === 'ALL' ? controls : controls.filter((c) => c.criterion === filterCriterion);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    const tabs = [
        { key: 'overview',  label: 'Overview',      icon: BarChart3 },
        { key: 'controls',  label: 'Controls',       icon: Shield },
        { key: 'risks',     label: 'Risk Register',  icon: AlertTriangle },
        { key: 'incidents', label: 'Incident Log',   icon: Activity },
    ] as const;

    return (
        <div>
            <div className="mb-4">
                <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Admin Portal
                </Link>
            </div>
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <h1 className="section-header" style={{ margin: 0 }}>SOC 2 Type II Readiness</h1>
                    <span className="badge font-semibold text-[10px]" style={{ background: '#EBF5EF', color: '#21944E' }}>
                        {overallScore >= 80 ? '✓ On Track' : overallScore >= 50 ? '⚠ In Progress' : '○ Early Stage'}
                    </span>
                </div>
                <p className="section-subtext">Track controls, evidence, risks, and incidents across all Trust Service Criteria</p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: '#F6F6F9', border: '1px solid #E2E4E9' }}>
                {tabs.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{
                            background: activeTab === key ? '#fff' : 'transparent',
                            color: activeTab === key ? '#3F4450' : '#A4A9B6',
                            boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
                <div>
                    {/* Score + Criteria bars */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                        <div className="glass-card p-6 flex flex-col items-center justify-center">
                            <ScoreRing score={overallScore} />
                            <p className="text-sm font-semibold mt-3" style={{ color: '#3F4450' }}>Overall Readiness</p>
                            <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>
                                {controls.filter((c) => c.status === 'COMPLIANT').length} of {controls.length} controls compliant
                            </p>
                        </div>

                        <div className="glass-card p-6 lg:col-span-2">
                            <h2 className="text-sm font-semibold mb-4" style={{ color: '#3F4450' }}>Trust Service Criteria</h2>
                            <div className="space-y-3">
                                {byCriterion.map((c) => {
                                    const meta = CRITERION_META[c.criterion] || { label: c.criterion, color: '#4141A2', bg: '#F0EAF8' };
                                    return (
                                        <div key={c.criterion}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium" style={{ color: '#3F4450' }}>{meta.label}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs" style={{ color: '#A4A9B6' }}>{c.compliant}/{c.total} compliant</span>
                                                    <span className="text-xs font-bold" style={{ color: meta.color }}>{c.score}%</span>
                                                </div>
                                            </div>
                                            <div className="h-2 rounded-full" style={{ background: '#F6F6F9' }}>
                                                <div className="h-2 rounded-full transition-all" style={{ width: `${c.score}%`, background: meta.color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Status summary cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {Object.entries(STATUS_META).map(([k, v]) => {
                            const count = controls.filter((c) => c.status === k).length;
                            return (
                                <div key={k} className="glass-card p-4 flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: v.bg }}>
                                        {k === 'COMPLIANT'   ? <CheckCircle className="w-4 h-4" style={{ color: v.color }} /> :
                                         k === 'IN_PROGRESS' ? <Clock className="w-4 h-4" style={{ color: v.color }} /> :
                                         k === 'AT_RISK'     ? <AlertTriangle className="w-4 h-4" style={{ color: v.color }} /> :
                                         <XCircle className="w-4 h-4" style={{ color: v.color }} />}
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold" style={{ color: '#3F4450' }}>{count}</p>
                                        <p className="text-[10px]" style={{ color: '#A4A9B6' }}>{v.label}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Open risks + recent incidents preview */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="glass-card p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Open Risks</h2>
                                <button onClick={() => setActiveTab('risks')} className="text-xs" style={{ color: '#4141A2' }}>View all →</button>
                            </div>
                            {risks.filter((r) => r.status === 'OPEN').length === 0 ? (
                                <p className="text-xs py-4 text-center" style={{ color: '#A4A9B6' }}>No open risks</p>
                            ) : (
                                <div className="space-y-2">
                                    {risks.filter((r) => r.status === 'OPEN').slice(0, 4).map((r) => {
                                        const rs = riskScore(r.likelihood, r.impact);
                                        const rl = riskLevel(rs);
                                        return (
                                            <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: '#F6F6F9' }}>
                                                <div>
                                                    <p className="text-xs font-semibold" style={{ color: '#3F4450' }}>{r.title}</p>
                                                    <p className="text-[10px]" style={{ color: '#A4A9B6' }}>{CRITERION_META[r.criterion || '']?.label || r.criterion}</p>
                                                </div>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${rl.color}18`, color: rl.color }}>{rl.label} ({rs})</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="glass-card p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Recent Incidents</h2>
                                <button onClick={() => setActiveTab('incidents')} className="text-xs" style={{ color: '#4141A2' }}>View all →</button>
                            </div>
                            {incidents.length === 0 ? (
                                <p className="text-xs py-4 text-center" style={{ color: '#A4A9B6' }}>No incidents logged</p>
                            ) : (
                                <div className="space-y-2">
                                    {incidents.slice(0, 4).map((inc) => {
                                        const sev = SEVERITY_META[inc.severity];
                                        return (
                                            <div key={inc.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: '#F6F6F9' }}>
                                                <div>
                                                    <p className="text-xs font-semibold" style={{ color: '#3F4450' }}>{inc.title}</p>
                                                    <p className="text-[10px]" style={{ color: '#A4A9B6' }}>{new Date(inc.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                                </div>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: sev.bg, color: sev.color }}>{inc.severity}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── CONTROLS TAB ────────────────────────────────────────────────────── */}
            {activeTab === 'controls' && (
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2 flex-wrap">
                            {['ALL', 'CC6', 'CC7', 'CC2', 'A1', 'CC3'].map((f) => (
                                <button key={f} onClick={() => setFilterCriterion(f)}
                                    className="text-[10px] px-2.5 py-1 rounded-full font-semibold transition-all"
                                    style={{
                                        background: filterCriterion === f ? '#3F4450' : '#F6F6F9',
                                        color: filterCriterion === f ? '#fff' : '#717684',
                                    }}
                                >{f === 'ALL' ? 'All Criteria' : f}</button>
                            ))}
                        </div>
                        <span className="text-xs" style={{ color: '#A4A9B6' }}>{filteredControls.length} controls</span>
                    </div>

                    <div className="space-y-2">
                        {filteredControls.map((ctrl) => {
                            const critMeta = CRITERION_META[ctrl.criterion] || { label: ctrl.criterion, color: '#A4A9B6', bg: '#F6F6F9' };
                            const statusMeta = STATUS_META[ctrl.status] || STATUS_META.NOT_STARTED;
                            const isExpanded = expandedControl === ctrl.id;
                            return (
                                <div key={ctrl.id} className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9' }}>
                                    {/* Row header */}
                                    <div
                                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => setExpandedControl(isExpanded ? null : ctrl.id)}
                                    >
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: critMeta.bg, color: critMeta.color }}>{ctrl.controlId}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold truncate" style={{ color: '#3F4450' }}>{ctrl.title}</p>
                                            <p className="text-[10px] truncate" style={{ color: '#A4A9B6' }}>{ctrl.description}</p>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            {/* Evidence pills */}
                                            <div className="flex items-center gap-1">
                                                <FileText className="w-3 h-3" style={{ color: '#A4A9B6' }} />
                                                <span className="text-[10px]" style={{ color: ctrl.verifiedCount > 0 ? '#21944E' : '#A4A9B6' }}>
                                                    {ctrl.verifiedCount}/{ctrl.evidenceCount}
                                                </span>
                                            </div>
                                            {/* Score bar */}
                                            <div className="w-16 h-1.5 rounded-full" style={{ background: '#E2E4E9' }}>
                                                <div className="h-1.5 rounded-full" style={{ width: `${ctrl.score}%`, background: ctrl.score >= 80 ? '#21944E' : ctrl.score >= 50 ? '#D3A236' : '#FA4338' }} />
                                            </div>
                                            <span className="badge font-semibold text-[10px]" style={{ background: statusMeta.bg, color: statusMeta.color }}>{statusMeta.label}</span>
                                            {isExpanded ? <ChevronDown className="w-4 h-4" style={{ color: '#A4A9B6' }} /> : <ChevronRight className="w-4 h-4" style={{ color: '#A4A9B6' }} />}
                                        </div>
                                    </div>

                                    {/* Expanded panel */}
                                    {isExpanded && (
                                        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: '#E2E4E9', background: '#FAFAFA' }}>
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                                                <div>
                                                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#A4A9B6' }}>Owner</p>
                                                    <p className="text-xs" style={{ color: '#3F4450' }}>{ctrl.owner || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#A4A9B6' }}>Review Frequency</p>
                                                    <p className="text-xs" style={{ color: '#3F4450' }}>{ctrl.frequency}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#A4A9B6' }}>Status</p>
                                                    <select
                                                        className="form-select text-xs"
                                                        value={ctrl.status}
                                                        onChange={(e) => updateControlStatus(ctrl.id, e.target.value)}
                                                    >
                                                        {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Evidence list */}
                                            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#A4A9B6' }}>Evidence ({ctrl.evidence.length})</p>
                                            {ctrl.evidence.length === 0 ? (
                                                <p className="text-xs mb-3" style={{ color: '#A4A9B6' }}>No evidence attached yet.</p>
                                            ) : (
                                                <div className="space-y-1.5 mb-3">
                                                    {ctrl.evidence.map((ev) => (
                                                        <div key={ev.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: ev.isVerified ? '#EBF5EF' : '#fff', border: '1px solid #E2E4E9' }}>
                                                            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ev.isVerified ? '#21944E' : '#E2E4E9' }} />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-semibold truncate" style={{ color: '#3F4450' }}>{ev.title}</p>
                                                                {ev.url && <a href={ev.url} target="_blank" rel="noreferrer" className="text-[10px] flex items-center gap-0.5 hover:underline" style={{ color: '#4141A2' }}><ExternalLink className="w-2.5 h-2.5" />{ev.url.substring(0, 50)}{ev.url.length > 50 ? '…' : ''}</a>}
                                                            </div>
                                                            {ev.reviewer && <span className="text-[10px]" style={{ color: '#A4A9B6' }}>{ev.reviewer}</span>}
                                                            <button onClick={() => verifyEvidence(ev.id, !ev.isVerified)} className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: ev.isVerified ? '#EBF5EF' : '#F6F6F9', color: ev.isVerified ? '#21944E' : '#717684' }}>
                                                                {ev.isVerified ? 'Verified' : 'Verify'}
                                                            </button>
                                                            <button onClick={() => deleteEvidence(ev.id)}><Trash2 className="w-3 h-3" style={{ color: '#FA4338' }} /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Add evidence inline form */}
                                            {addingEvFor === ctrl.id ? (
                                                <div className="rounded-xl p-3 space-y-2" style={{ background: '#F6F6F9', border: '1px solid #E2E4E9' }}>
                                                    <input className="form-input text-xs" placeholder="Evidence title *" value={evForm.title} onChange={(e) => setEvForm({ ...evForm, title: e.target.value })} />
                                                    <input className="form-input text-xs" placeholder="Link / URL (optional)" value={evForm.url} onChange={(e) => setEvForm({ ...evForm, url: e.target.value })} />
                                                    <div className="flex gap-2">
                                                        <input className="form-input text-xs flex-1" placeholder="Description" value={evForm.description} onChange={(e) => setEvForm({ ...evForm, description: e.target.value })} />
                                                        <input className="form-input text-xs flex-1" placeholder="Reviewer name" value={evForm.reviewer} onChange={(e) => setEvForm({ ...evForm, reviewer: e.target.value })} />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => addEvidence(ctrl.id)} disabled={!evForm.title || evSaving} className="btn-primary text-xs">
                                                            {evSaving ? 'Saving…' : 'Add Evidence'}
                                                        </button>
                                                        <button onClick={() => setAddingEvFor(null)} className="btn-ghost text-xs">Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button onClick={() => setAddingEvFor(ctrl.id)} className="btn-ghost text-xs">
                                                    <Plus className="w-3.5 h-3.5" /> Add Evidence
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── RISK REGISTER TAB ───────────────────────────────────────────────── */}
            {activeTab === 'risks' && (
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Risk Register</h2>
                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>Likelihood × Impact heat scoring</p>
                        </div>
                        <button onClick={() => setShowRiskForm(!showRiskForm)} className="btn-primary">
                            <Plus className="w-4 h-4" /> Add Risk
                        </button>
                    </div>

                    {showRiskForm && (
                        <div className="rounded-xl p-4 mb-5 space-y-3" style={{ background: '#F6F6F9', border: '1px solid #E2E4E9' }}>
                            <p className="text-xs font-semibold" style={{ color: '#3F4450' }}>New Risk Item</p>
                            <input className="form-input" placeholder="Risk title *" value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} />
                            <textarea className="form-input text-xs" rows={2} placeholder="Description" value={riskForm.description} onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })} />
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <div>
                                    <label className="form-label text-[10px]">Criterion</label>
                                    <select className="form-select" value={riskForm.criterion} onChange={(e) => setRiskForm({ ...riskForm, criterion: e.target.value })}>
                                        {Object.keys(CRITERION_META).map((k) => <option key={k} value={k}>{k}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label text-[10px]">Likelihood</label>
                                    <select className="form-select" value={riskForm.likelihood} onChange={(e) => setRiskForm({ ...riskForm, likelihood: Number(e.target.value) })}>
                                        {[1,2,3,4].map((n) => <option key={n} value={n}>{n} — {LIKELIHOOD_LABELS[n]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label text-[10px]">Impact</label>
                                    <select className="form-select" value={riskForm.impact} onChange={(e) => setRiskForm({ ...riskForm, impact: Number(e.target.value) })}>
                                        {[1,2,3,4].map((n) => <option key={n} value={n}>{n} — {IMPACT_LABELS[n]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label text-[10px]">Owner</label>
                                    <input className="form-input" placeholder="Team/person" value={riskForm.owner} onChange={(e) => setRiskForm({ ...riskForm, owner: e.target.value })} />
                                </div>
                            </div>
                            <textarea className="form-input text-xs" rows={2} placeholder="Mitigation plan" value={riskForm.mitigation} onChange={(e) => setRiskForm({ ...riskForm, mitigation: e.target.value })} />
                            <div className="flex gap-2">
                                <button onClick={addRisk} disabled={!riskForm.title || riskSaving} className="btn-primary">{riskSaving ? 'Saving…' : 'Add Risk'}</button>
                                <button onClick={() => setShowRiskForm(false)} className="btn-ghost">Cancel</button>
                            </div>
                        </div>
                    )}

                    {risks.length === 0 ? (
                        <div className="text-center py-12">
                            <AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: '#E2E4E9' }} />
                            <p className="text-sm" style={{ color: '#A4A9B6' }}>No risks logged yet</p>
                            <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>Add risks to track your mitigation posture</p>
                        </div>
                    ) : (
                        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9' }}>
                            <table className="w-full text-xs">
                                <thead>
                                    <tr style={{ background: '#F6F6F9', borderBottom: '2px solid #E2E4E9' }}>
                                        <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>RISK</th>
                                        <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>CRITERION</th>
                                        <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>LIKELIHOOD</th>
                                        <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>IMPACT</th>
                                        <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>RISK LEVEL</th>
                                        <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>OWNER</th>
                                        <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>STATUS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {risks.map((r) => {
                                        const rs = riskScore(r.likelihood, r.impact);
                                        const rl = riskLevel(rs);
                                        const critMeta = CRITERION_META[r.criterion || ''];
                                        return (
                                            <tr key={r.id} style={{ borderBottom: '1px solid #F6F6F9' }}>
                                                <td className="px-3 py-3">
                                                    <p className="font-semibold" style={{ color: '#3F4450' }}>{r.title}</p>
                                                    {r.mitigation && <p className="text-[10px] mt-0.5" style={{ color: '#A4A9B6' }}>↳ {r.mitigation.substring(0, 60)}{r.mitigation.length > 60 ? '…' : ''}</p>}
                                                </td>
                                                <td className="px-3 py-3">
                                                    {critMeta && <span className="badge text-[10px]" style={{ background: critMeta.bg, color: critMeta.color }}>{r.criterion}</span>}
                                                </td>
                                                <td className="px-3 py-3" style={{ color: '#717684' }}>{LIKELIHOOD_LABELS[r.likelihood]}</td>
                                                <td className="px-3 py-3" style={{ color: '#717684' }}>{IMPACT_LABELS[r.impact]}</td>
                                                <td className="px-3 py-3">
                                                    <span className="badge font-bold text-[10px]" style={{ background: `${rl.color}18`, color: rl.color }}>{rl.label} ({rs})</span>
                                                </td>
                                                <td className="px-3 py-3" style={{ color: '#717684' }}>{r.owner || '—'}</td>
                                                <td className="px-3 py-3">
                                                    <select className="form-select text-xs" style={{ width: 110 }} value={r.status} onChange={(e) => updateRiskStatus(r.id, e.target.value)}>
                                                        {['OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED'].map((s) => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── INCIDENT LOG TAB ─────────────────────────────────────────────────── */}
            {activeTab === 'incidents' && (
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Incident Log</h2>
                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>Availability, security, and confidentiality incidents (A1 criterion)</p>
                        </div>
                        <button onClick={() => setShowIncForm(!showIncForm)} className="btn-primary">
                            <Plus className="w-4 h-4" /> Log Incident
                        </button>
                    </div>

                    {showIncForm && (
                        <div className="rounded-xl p-4 mb-5 space-y-3" style={{ background: '#F6F6F9', border: '1px solid #E2E4E9' }}>
                            <p className="text-xs font-semibold" style={{ color: '#3F4450' }}>New Incident</p>
                            <input className="form-input" placeholder="Incident title *" value={incForm.title} onChange={(e) => setIncForm({ ...incForm, title: e.target.value })} />
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <div>
                                    <label className="form-label text-[10px]">Type</label>
                                    <select className="form-select" value={incForm.incidentType} onChange={(e) => setIncForm({ ...incForm, incidentType: e.target.value })}>
                                        {['AVAILABILITY', 'SECURITY', 'CONFIDENTIALITY'].map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label text-[10px]">Severity</label>
                                    <select className="form-select" value={incForm.severity} onChange={(e) => setIncForm({ ...incForm, severity: e.target.value })}>
                                        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label text-[10px]">Occurred At *</label>
                                    <input type="datetime-local" className="form-input text-xs" value={incForm.occurredAt} onChange={(e) => setIncForm({ ...incForm, occurredAt: e.target.value })} />
                                </div>
                                <div>
                                    <label className="form-label text-[10px]">Reported By</label>
                                    <input className="form-input" placeholder="Name" value={incForm.reportedBy} onChange={(e) => setIncForm({ ...incForm, reportedBy: e.target.value })} />
                                </div>
                            </div>
                            <textarea className="form-input text-xs" rows={2} placeholder="Description" value={incForm.description} onChange={(e) => setIncForm({ ...incForm, description: e.target.value })} />
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                <textarea className="form-input text-xs" rows={2} placeholder="Root cause" value={incForm.rootCause} onChange={(e) => setIncForm({ ...incForm, rootCause: e.target.value })} />
                                <textarea className="form-input text-xs" rows={2} placeholder="Remediation steps" value={incForm.remediation} onChange={(e) => setIncForm({ ...incForm, remediation: e.target.value })} />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={addIncident} disabled={!incForm.title || !incForm.occurredAt || incSaving} className="btn-primary">{incSaving ? 'Saving…' : 'Log Incident'}</button>
                                <button onClick={() => setShowIncForm(false)} className="btn-ghost">Cancel</button>
                            </div>
                        </div>
                    )}

                    {incidents.length === 0 ? (
                        <div className="text-center py-12">
                            <Zap className="w-8 h-8 mx-auto mb-2" style={{ color: '#E2E4E9' }} />
                            <p className="text-sm" style={{ color: '#A4A9B6' }}>No incidents logged</p>
                            <p className="text-xs mt-1" style={{ color: '#A4A9B6' }}>Log availability and security incidents for your SOC 2 Type II audit trail</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {incidents.map((inc) => {
                                const sev = SEVERITY_META[inc.severity];
                                return (
                                    <div key={inc.id} className="rounded-xl border p-4" style={{ borderColor: '#E2E4E9', background: inc.isResolved ? '#FAFAFA' : '#fff' }}>
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="text-sm font-semibold" style={{ color: inc.isResolved ? '#A4A9B6' : '#3F4450' }}>{inc.title}</p>
                                                    <span className="badge text-[10px] font-bold" style={{ background: sev.bg, color: sev.color }}>{inc.severity}</span>
                                                    <span className="badge text-[10px]" style={{ background: '#F6F6F9', color: '#717684' }}>{inc.incidentType}</span>
                                                    {inc.isResolved && <span className="badge text-[10px]" style={{ background: '#EBF5EF', color: '#21944E' }}>✓ Resolved</span>}
                                                </div>
                                                <p className="text-[10px]" style={{ color: '#A4A9B6' }}>
                                                    {new Date(inc.occurredAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                    {inc.reportedBy && ` · Reported by ${inc.reportedBy}`}
                                                    {inc.durationMins && ` · ${inc.durationMins} min downtime`}
                                                </p>
                                            </div>
                                            {!inc.isResolved && (
                                                <button onClick={() => resolveIncident(inc.id)} className="btn-ghost text-xs flex-shrink-0" style={{ color: '#21944E', borderColor: 'rgba(33,148,78,0.3)' }}>
                                                    <CheckCircle className="w-3.5 h-3.5" /> Resolve
                                                </button>
                                            )}
                                        </div>
                                        {inc.description && <p className="text-xs mb-2" style={{ color: '#717684' }}>{inc.description}</p>}
                                        {(inc.rootCause || inc.remediation) && (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-2">
                                                {inc.rootCause && (
                                                    <div className="rounded-lg p-2.5" style={{ background: '#FFF5F5' }}>
                                                        <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#FA4338' }}>Root Cause</p>
                                                        <p className="text-xs" style={{ color: '#717684' }}>{inc.rootCause}</p>
                                                    </div>
                                                )}
                                                {inc.remediation && (
                                                    <div className="rounded-lg p-2.5" style={{ background: '#EBF5EF' }}>
                                                        <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#21944E' }}>Remediation</p>
                                                        <p className="text-xs" style={{ color: '#717684' }}>{inc.remediation}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
