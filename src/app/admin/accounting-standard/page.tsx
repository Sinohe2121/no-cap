'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ArrowLeft, Save } from 'lucide-react';

const STANDARDS = [
    {
        key: 'ASC_350_40',
        label: 'ASC 350-40',
        badge: 'Default',
        badgeColor: '#4141A2',
        description: 'Traditional GAAP standard for internal-use software. Capitalizes Story tickets on DEV-phase capitalizable projects. Does not require management authorization flags.',
        rules: ['STORY tickets on capitalizable DEV projects → Capitalize', 'BUG and TASK tickets → Expense', 'PLANNING/LIVE/RETIRED projects → Expense'],
    },
    {
        key: 'ASU_2025_06',
        label: 'ASU 2025-06',
        badge: 'Effective Dec 2025',
        badgeColor: '#D3A236',
        description: 'Updated FASB standard (effective Dec 15, 2025). Same ticket rules, but additionally requires management authorization and probable-to-complete flags set on each project.',
        rules: ['STORY tickets on DEV projects → Capitalize, BUT only if...', '→ Management Authorization flag is ON', '→ Probable to Complete flag is ON', 'BUG, TASK, any non-flagged project → Expense'],
    },
    {
        key: 'IFRS',
        label: 'IFRS (IAS 38)',
        badge: 'International',
        badgeColor: '#21944E',
        description: 'International Financial Reporting Standard. Capitalizes all ticket types on capitalizable projects once technical feasibility is established (DEV or LIVE status).',
        rules: ['ALL ticket types on capitalizable DEV or LIVE projects → Capitalize', 'PLANNING and RETIRED projects → Expense', 'No ticket-type restriction (BUGs and TASKs may capitalize)'],
    },
];

const configDescriptions: Record<string, { icon: string; desc: string; label: string }> = {
    FRINGE_BENEFIT_RATE: { label: 'Fringe Benefit Rate (Multiplier)', icon: '💰', desc: 'Multiplier applied to base salary (e.g., 0.25 = 25% for benefits)' },
    DEFAULT_AMORTIZATION_LIFE: { label: 'Default Amortization Life (Months)', icon: '📅', desc: 'Number of months for straight-line amortization (standard: 36)' },
    CAPITALIZATION_THRESHOLD: { label: 'Capitalization Threshold Override', icon: '🎯', desc: 'Minimum dollar amount to capitalize (0 = no threshold)' }
};

export default function AccountingStandardPage() {
    const [activeStandard, setActiveStandard] = useState('ASC_350_40');
    const [standardSaving, setStandardSaving] = useState(false);
    const [standardSaved, setStandardSaved] = useState(false);
    
    // Global Configs State
    const [configs, setConfigs] = useState<any[]>([]);
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [configSavedInfo, setConfigSavedInfo] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin')
            .then((res) => res.json())
            .then((data) => {
                const std = data.configs.find((c: any) => c.key === 'ACCOUNTING_STANDARD');
                if (std) setActiveStandard(std.value);

                // Load matrix variables explicitly
                setConfigs(data.configs);
                const vals: Record<string, string> = {};
                data.configs.forEach((c: any) => { vals[c.key] = c.value; });
                setEditValues(vals);
            })
            .finally(() => setLoading(false));
    }, []);

    const saveConfig = async (key: string) => {
        await fetch('/api/admin', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'config', key, value: editValues[key] }),
        });
        setConfigSavedInfo(key);
        setTimeout(() => setConfigSavedInfo(null), 2000);
    };

    const saveStandard = async (value: string) => {
        setActiveStandard(value);
        setStandardSaving(true);
        await fetch('/api/admin', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'config', key: 'ACCOUNTING_STANDARD', value, label: 'Accounting Standard Mode' }),
        });
        setStandardSaving(false);
        setStandardSaved(true);
        setTimeout(() => setStandardSaved(false), 2500);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    return (
        <div className="pb-12">
            <div className="mb-6">
                <Link href="/admin" className="text-sm font-semibold flex items-center gap-2 mb-4 hover:underline" style={{ color: '#4141A2', width: 'max-content' }}>
                    <ArrowLeft className="w-4 h-4" /> Back to Admin Portal
                </Link>
                <h1 className="section-header">Accounting Standard</h1>
                <p className="section-subtext">Controls how the capitalization rule engine classifies tickets globally.</p>
            </div>

            <div className="glass-card p-6 mb-8">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#EBF5EF' }}>
                            <BookOpen className="w-6 h-6" style={{ color: '#21944E' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: '#3F4450' }}>System Framework Array</h2>
                            <p className="text-xs font-semibold" style={{ color: '#A4A9B6' }}>Select the accounting pipeline restriction bounds.</p>
                        </div>
                    </div>
                    {standardSaved && <span className="text-xs font-black uppercase" style={{ color: '#21944E' }}>✓ Saved to Register</span>}
                    {standardSaving && <span className="text-xs font-bold uppercase" style={{ color: '#A4A9B6' }}>Committing…</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {STANDARDS.map((std) => {
                        const isActive = activeStandard === std.key;
                        return (
                            <button
                                key={std.key}
                                onClick={() => saveStandard(std.key)}
                                className="text-left rounded-xl p-5 transition-all w-full flex flex-col items-start hover:shadow-md"
                                style={{
                                    background: isActive ? '#F0EAF8' : '#F6F6F9',
                                    border: `2px solid ${isActive ? '#4141A2' : 'transparent'}`,
                                    cursor: 'pointer',
                                }}
                            >
                                <div className="flex items-center justify-between mb-3 w-full">
                                    <span className="text-[15px] font-black" style={{ color: '#3F4450' }}>{std.label}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                                        style={{ background: `${std.badgeColor}18`, color: std.badgeColor }}>
                                        {std.badge}
                                    </span>
                                </div>
                                <p className="text-[12px] font-medium leading-relaxed mb-4 flex-1" style={{ color: '#717684' }}>{std.description}</p>
                                <ul className="space-y-2 mb-2 w-full">
                                    {std.rules.map((r, i) => (
                                        <li key={i} className="text-[11px] font-semibold flex items-start gap-2" style={{ color: '#A4A9B6' }}>
                                            <span style={{ color: isActive ? '#4141A2' : '#A4A9B6', marginTop: 1 }}>›</span>
                                            {r}
                                        </li>
                                    ))}
                                </ul>
                                {isActive && (
                                    <div className="mt-4 w-full pt-4 border-t" style={{ borderColor: 'rgba(65,65,162,0.15)' }}>
                                        <span className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: '#4141A2' }}>
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#4141A2]" /> Locked Target
                                        </span>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="glass-card p-6 mt-8">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#F0EAF8' }}>
                        <BookOpen className="w-6 h-6" style={{ color: '#4141A2' }} />
                    </div>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: '#3F4450' }}>Logic Matrices & Registry Tokens</h2>
                        <p className="text-xs font-semibold" style={{ color: '#A4A9B6' }}>Individual variable bounds defining global accounting functionality.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {configs.filter(c => ['FRINGE_BENEFIT_RATE', 'DEFAULT_AMORTIZATION_LIFE', 'CAPITALIZATION_THRESHOLD'].includes(c.key)).map((config) => {
                        const meta = configDescriptions[config.key] || { icon: '⚙️', desc: '', label: config.label };
                        return (
                            <div key={config.key} className="rounded-xl p-5 border shadow-sm transition-all hover:bg-[#F9FAFB]/50" style={{ background: '#FFFFFF', borderColor: '#E2E4E9' }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[16px]">{meta.icon}</span>
                                    <span className="text-[11px] font-black uppercase tracking-widest leading-tight line-clamp-1" style={{ color: '#3F4450' }}>{meta.label}</span>
                                </div>
                                <p className="text-[12px] font-medium leading-relaxed mb-4 h-10" style={{ color: '#A4A9B6' }}>{meta.desc}</p>
                                <div className="flex items-center gap-2 relative">
                                    <input
                                        type="text"
                                        value={editValues[config.key] || ''}
                                        onChange={(e) => setEditValues({ ...editValues, [config.key]: e.target.value })}
                                        className="form-input text-sm font-bold flex-1"
                                        style={{ height: '40px' }}
                                    />
                                    <button
                                        onClick={() => saveConfig(config.key)}
                                        className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors border"
                                        style={{
                                            background: configSavedInfo === config.key ? '#EBF5EF' : '#FFFFFF',
                                            borderColor: configSavedInfo === config.key ? 'rgba(33,148,78,0.2)' : '#E2E4E9',
                                            color: configSavedInfo === config.key ? '#21944E' : '#717684'
                                        }}
                                    >
                                        <Save className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
