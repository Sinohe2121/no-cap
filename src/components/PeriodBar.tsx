'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarDays, ChevronDown, Check } from 'lucide-react';
import { usePeriod, PeriodPreset } from '@/context/PeriodContext';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(d: Date) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PeriodBar() {
    const { preset, customStart, customEnd, label, range, fyStartMonth, setPreset, setCustomDates } = usePeriod();
    const [open, setOpen] = useState(false);
    const [localStart, setLocalStart] = useState(customStart);
    const [localEnd, setLocalEnd] = useState(customEnd);
    const ref = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        setLocalStart(customStart);
        setLocalEnd(customEnd);
    }, [customStart, customEnd]);

    const handlePreset = (p: PeriodPreset) => {
        setPreset(p);
        if (p !== 'custom') setOpen(false);
    };

    const handleApplyCustom = () => {
        if (localStart && localEnd) {
            setCustomDates(localStart, localEnd);
            setOpen(false);
        }
    };

    // Build dynamic descriptions based on fyStartMonth
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed

    // Current month desc
    const curMonthStart = new Date(y, m, 1);
    const curMonthEnd = new Date(y, m + 1, 0);
    const curMonthDesc = `${MONTH_NAMES[curMonthStart.getMonth()]} 1 – ${MONTH_NAMES[curMonthEnd.getMonth()]} ${curMonthEnd.getDate()}, ${y}`;

    // Last month desc
    const lastMonthStart = new Date(y, m - 1, 1);
    const lastMonthEnd = new Date(y, m, 0);
    const lastMonthDesc = `${MONTH_NAMES[lastMonthStart.getMonth()]} 1 – ${MONTH_NAMES[lastMonthEnd.getMonth()]} ${lastMonthEnd.getDate()}, ${lastMonthStart.getFullYear()}`;

    // YTD desc — starts at FY start
    const ytdDesc = `${formatDate(range.start)} – today`;

    // getFy label for last year preset via range (will be set by context)
    // We just show the range from the context itself
    const getPresetDesc = (p: PeriodPreset): string => {
        if (p === 'current_month') return curMonthDesc;
        if (p === 'last_month') return lastMonthDesc;
        if (p === 'ytd') return ytdDesc;
        if (p === 'last_fiscal_year') return label; // context already computed it
        if (p === 'all_time') return 'Since inception – present';
        if (p === 'custom') return 'Pick your own dates';
        return '';
    };

    const PRESETS: { value: PeriodPreset; label: string }[] = [
        { value: 'current_month',    label: 'Current Month' },
        { value: 'last_month',       label: 'Last Month' },
        { value: 'ytd',              label: fyStartMonth === 1 ? 'Year to Date' : `FY Year to Date` },
        { value: 'last_fiscal_year', label: 'Last Fiscal Year' },
        { value: 'all_time',         label: 'All Time' },
        { value: 'custom',           label: 'Custom Range' },
    ];

    return (
        <div
            style={{
                background: '#FFFFFF',
                borderBottom: '1px solid #E2E4E9',
                padding: '0 28px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 48,
                position: 'sticky',
                top: 0,
                zIndex: 40,
                marginLeft: 260,
            }}
        >
            {mounted && (
                <>
                    <CalendarDays style={{ width: 14, height: 14, color: '#A4A9B6', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                        Reporting Period
                    </span>

            <div ref={ref} style={{ position: 'relative' }}>
                <button
                    onClick={() => setOpen((o) => !o)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: open ? '#FFF5F5' : '#F6F6F9',
                        border: `1.5px solid ${open ? '#FA4338' : '#E2E4E9'}`,
                        borderRadius: 8,
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        color: open ? '#FA4338' : '#3F4450',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <span>{label}</span>
                    <ChevronDown
                        style={{
                            width: 14,
                            height: 14,
                            color: open ? '#FA4338' : '#A4A9B6',
                            transform: open ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.15s',
                        }}
                    />
                </button>

                {open && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            background: '#FFFFFF',
                            border: '1px solid #E2E4E9',
                            borderRadius: 12,
                            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                            minWidth: 280,
                            zIndex: 200,
                            overflow: 'hidden',
                        }}
                    >
                        <div style={{ padding: '6px 0' }}>
                            {PRESETS.map((p, i) => (
                                <button
                                    key={p.value}
                                    onClick={() => handlePreset(p.value)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '10px 16px',
                                        fontSize: 13,
                                        color: '#3F4450',
                                        background: preset === p.value ? '#FFF5F5' : 'transparent',
                                        border: 'none',
                                        borderTop: i > 0 && p.value === 'custom' ? '1px solid #F0F0F5' : 'none',
                                        cursor: 'pointer',
                                        transition: 'background 0.1s',
                                        gap: 8,
                                    }}
                                    onMouseEnter={(e) => {
                                        if (preset !== p.value) (e.currentTarget as HTMLButtonElement).style.background = '#F6F6F9';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (preset !== p.value) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: preset === p.value ? 600 : 500, color: preset === p.value ? '#FA4338' : '#3F4450', marginBottom: 1 }}>
                                            {p.label}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#A4A9B6' }}>
                                            {preset === p.value && p.value !== 'custom'
                                                ? `${formatDate(range.start)} – ${formatDate(range.end)}`
                                                : getPresetDesc(p.value)}
                                        </div>
                                    </div>
                                    {preset === p.value && (
                                        <Check style={{ width: 14, height: 14, color: '#FA4338', flexShrink: 0 }} />
                                    )}
                                </button>
                            ))}
                        </div>

                        {preset === 'custom' && (
                            <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E4E9', background: '#FAFAFA' }}>
                                <div style={{ marginBottom: 8 }}>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#717684', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Start Date
                                    </label>
                                    <input
                                        type="date"
                                        value={localStart}
                                        onChange={(e) => setLocalStart(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #E2E4E9', borderRadius: 6, fontSize: 12, color: '#3F4450', background: '#FFFFFF', outline: 'none' }}
                                    />
                                </div>
                                <div style={{ marginBottom: 12 }}>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#717684', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={localEnd}
                                        onChange={(e) => setLocalEnd(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #E2E4E9', borderRadius: 6, fontSize: 12, color: '#3F4450', background: '#FFFFFF', outline: 'none' }}
                                    />
                                </div>
                                <button
                                    onClick={handleApplyCustom}
                                    disabled={!localStart || !localEnd}
                                    style={{
                                        width: '100%', padding: '9px',
                                        background: localStart && localEnd ? '#FA4338' : '#E2E4E9',
                                        color: '#FFFFFF', border: 'none', borderRadius: 8,
                                        fontSize: 13, fontWeight: 600,
                                        cursor: localStart && localEnd ? 'pointer' : 'default',
                                    }}
                                >
                                    Apply Range
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Show active range dates */}
            {preset !== 'custom' && (
                <span style={{ fontSize: 12, color: '#A4A9B6' }}>
                    {formatDate(range.start)} – {formatDate(range.end)}
                </span>
            )}

            {/* FY label hint when non-calendar FY */}
            {fyStartMonth !== 1 && (
                <span style={{
                    marginLeft: 'auto',
                    fontSize: 11, fontWeight: 600,
                    color: '#4141A2',
                    background: '#EEF2FF',
                    padding: '2px 10px',
                    borderRadius: 20,
                    border: '1px solid rgba(65,65,162,0.15)',
                    flexShrink: 0,
                }}>
                    FY starts {MONTH_NAMES[fyStartMonth - 1]} 1
                </span>
            )}
                </>
            )}
        </div>
    );
}
