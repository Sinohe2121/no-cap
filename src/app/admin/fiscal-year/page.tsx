'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ArrowLeft, Check } from 'lucide-react';

const MONTHS = [
    { value: 1,  label: 'January' },
    { value: 2,  label: 'February' },
    { value: 3,  label: 'March' },
    { value: 4,  label: 'April' },
    { value: 5,  label: 'May' },
    { value: 6,  label: 'June' },
    { value: 7,  label: 'July' },
    { value: 8,  label: 'August' },
    { value: 9,  label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
];

function buildQuarterPreviews(fyStartMonth: number): string[] {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return [0, 1, 2, 3].map((q) => {
        const s = (fyStartMonth - 1 + q * 3) % 12;
        const e = (s + 2) % 12;
        return `Q${q + 1}: ${months[s]} – ${months[e]}`;
    });
}

export default function FiscalYearPage() {
    const [fyStartMonth, setFyStartMonth] = useState(1);
    const [fySaving, setFySaving] = useState(false);
    const [fySaved, setFySaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/config/fiscal-year')
            .then((r) => r.json())
            .then((d) => { if (d.fiscalYearStartMonth) setFyStartMonth(d.fiscalYearStartMonth); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const saveFiscalYear = async (month: number) => {
        setFyStartMonth(month);
        setFySaving(true);
        setFySaved(false);
        await fetch('/api/admin', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'config', key: 'FISCAL_YEAR_START_MONTH', value: String(month), label: 'Fiscal Year Start Month' }),
        });
        
        try { localStorage.setItem('nocap_fy_start_month', String(month)); } catch {}
        
        // Dispatch explicit browser event to trigger the overarching Sidebar reporting bounds
        window.dispatchEvent(new Event('storage'));

        setFySaving(false);
        setFySaved(true);
        setTimeout(() => setFySaved(false), 2500);
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
                <h1 className="section-header">Fiscal boundaries matrix</h1>
                <p className="section-subtext">Controls quarter mapping pipelines for all reports dynamically across the dashboard constraints.</p>
            </div>

            <div className="glass-card p-8">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#E8F4F8' }}>
                            <CalendarDays className="w-6 h-6" style={{ color: '#4141A2' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: '#3F4450' }}>Root Reporting Matrix Limits</h2>
                            <p className="text-xs font-semibold" style={{ color: '#A4A9B6' }}>Force constraints natively cascading down the Period Filter.</p>
                        </div>
                    </div>
                    {fySaved && <span className="text-xs font-black uppercase tracking-wide" style={{ color: '#21944E' }}>✓ Synchronized Natively</span>}
                    {fySaving && <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#A4A9B6' }}>Committing…</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest mb-4" style={{ color: '#717684' }}>Fiscal Year Start Month Overrides</p>
                        <div className="grid grid-cols-3 gap-3">
                            {MONTHS.map((mo) => {
                                const isActive = fyStartMonth === mo.value;
                                return (
                                    <button
                                        key={mo.value}
                                        onClick={() => saveFiscalYear(mo.value)}
                                        className="rounded-xl p-4 text-left transition-all flex items-center justify-between hover:shadow-sm"
                                        style={{
                                            background: isActive ? '#EEF2FF' : '#F6F6F9',
                                            border: `2px solid ${isActive ? '#4141A2' : 'transparent'}`,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: isActive ? '#4141A2' : '#3F4450' }}>
                                            {mo.label.slice(0, 3)}
                                        </span>
                                        {isActive && <Check className="w-4 h-4" style={{ color: '#4141A2' }} />}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[12px] font-medium leading-relaxed mt-5 p-4 rounded-xl border border-[#E2E4E9]" style={{ color: '#717684', background: '#F9FAFB' }}>
                            {fyStartMonth === 1
                                ? 'Currently using the baseline flat calendar limits (Jan 1). Modify to restrict dashboard filtering.'
                                : `Targeted fiscal constraint limits restricted explicitly to ${MONTHS[fyStartMonth - 1].label} 1. Period navigation dynamically reflects array overrides globally.`}
                        </p>
                    </div>

                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest mb-4" style={{ color: '#717684' }}>Quarterly Matrix Bounds Preview</p>
                        <div className="space-y-3">
                            {buildQuarterPreviews(fyStartMonth).map((q, i) => (
                                <div
                                    key={i}
                                    className="rounded-xl px-5 py-4 flex items-center gap-4 border"
                                    style={{ background: '#FFFFFF', borderColor: '#E2E4E9' }}
                                >
                                    <span
                                        className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md"
                                        style={{ background: '#4141A2', color: '#FFFFFF' }}
                                    >
                                        Q{i + 1}
                                    </span>
                                    <span className="text-[14px] font-bold" style={{ color: '#3F4450' }}>
                                        {q.replace(`Q${i + 1}: `, '')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
