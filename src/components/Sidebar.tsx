'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';
import {
    LayoutDashboard,
    FolderKanban,
    Users,
    BookOpen,
    Settings,
    BarChart2,
    Activity,
    UsersRound,
    ChevronLeft,
    ChevronRight,
    LogOut,
    CalendarDays,
    ChevronDown,
    Check,
    Search,
} from 'lucide-react';
import { usePeriod, PeriodPreset } from '@/context/PeriodContext';

function formatDate(d: Date) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Projects & Tickets', icon: FolderKanban },
    { href: '/developers', label: 'FTE & Payroll', icon: Users },
    { href: '/engineering-health', label: 'Engineering Health', icon: Activity },
    { href: '/team-view', label: 'Team View', icon: UsersRound },
    { href: '/accounting', label: 'Accounting', icon: BookOpen },
    { href: '/reports', label: 'Reports', icon: BarChart2 },
    { href: '/admin',        label: 'Admin Portal',   icon: Settings },
];

const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 72;

/* ─── Inline Period Selector ───────────────────────── */
function SidebarPeriodSelector({ collapsed }: { collapsed: boolean }) {
    const { preset, customStart, customEnd, label, range, setPreset, setCustomDates } = usePeriod();
    const [open, setOpen] = useState(false);
    const [localStart, setLocalStart] = useState(customStart);
    const [localEnd, setLocalEnd] = useState(customEnd);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocalStart(customStart);
        setLocalEnd(customEnd);
    }, [customStart, customEnd]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

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

    const PRESETS: { value: PeriodPreset; label: string }[] = [
        { value: 'current_month',    label: 'Current Month' },
        { value: 'last_month',       label: 'Last Month' },
        { value: 'ytd',              label: 'Year to Date' },
        { value: 'last_fiscal_year', label: 'Last Fiscal Year' },
        { value: 'all_time',         label: 'All Time' },
        { value: 'custom',           label: 'Custom Range' },
    ];

    if (collapsed) {
        return (
            <div ref={ref} style={{ padding: '0 10px', marginBottom: 8, position: 'relative' }}>
                <button
                    onClick={() => setOpen(o => !o)}
                    title={`Period: ${label}`}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 0',
                        background: open ? 'rgba(250,67,56,0.12)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${open ? 'rgba(250,67,56,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 10,
                        cursor: 'pointer',
                        color: open ? '#FA4338' : '#A4A9B6',
                        transition: 'all 0.15s',
                    }}
                >
                    <CalendarDays style={{ width: 16, height: 16 }} />
                </button>

                {open && (
                    <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 8px)',
                        left: 0,
                        width: 280,
                        background: '#FFFFFF',
                        border: '1px solid #E2E4E9',
                        borderRadius: 12,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                        zIndex: 200,
                        overflow: 'hidden',
                    }}>
                        <div style={{ padding: '6px 0' }}>
                            {PRESETS.map((p, i) => (
                                <button
                                    key={p.value}
                                    onClick={() => handlePreset(p.value)}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13,
                                        color: '#3F4450',
                                        background: preset === p.value ? '#FFF5F5' : 'transparent',
                                        border: 'none',
                                        borderTop: i > 0 && p.value === 'custom' ? '1px solid #F0F0F5' : 'none',
                                        cursor: 'pointer', transition: 'background 0.1s', gap: 8,
                                    }}
                                    onMouseEnter={(e) => { if (preset !== p.value) e.currentTarget.style.background = '#F6F6F9'; }}
                                    onMouseLeave={(e) => { if (preset !== p.value) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <div style={{ fontWeight: preset === p.value ? 600 : 500, color: preset === p.value ? '#FA4338' : '#3F4450' }}>
                                        {p.label}
                                    </div>
                                    {preset === p.value && <Check style={{ width: 14, height: 14, color: '#FA4338' }} />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div ref={ref} style={{ padding: '0 16px', marginBottom: 12, position: 'relative' }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#717684', marginBottom: 8, paddingLeft: 4 }}>
                Reporting Period
            </p>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: open ? 'rgba(250,67,56,0.12)' : 'rgba(255,255,255,0.06)',
                    border: `1.5px solid ${open ? 'rgba(250,67,56,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 10,
                    padding: '9px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    color: open ? '#FA4338' : '#fff',
                    transition: 'all 0.15s',
                    textAlign: 'left',
                }}
            >
                <CalendarDays style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.6 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                <ChevronDown style={{
                    width: 14, height: 14,
                    transform: open ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s',
                    flexShrink: 0, opacity: 0.5,
                }} />
            </button>
            <p style={{ fontSize: 10, marginTop: 6, paddingLeft: 4, color: '#717684' }}>
                {formatDate(range.start)} – {formatDate(range.end)}
            </p>

            {open && (
                <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: 16, right: 16,
                    background: '#FFFFFF',
                    border: '1px solid #E2E4E9',
                    borderRadius: 12,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                    zIndex: 200,
                    overflow: 'hidden',
                }}>
                    <div style={{ padding: '6px 0' }}>
                        {PRESETS.map((p, i) => (
                            <button
                                key={p.value}
                                onClick={() => handlePreset(p.value)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13,
                                    color: '#3F4450',
                                    background: preset === p.value ? '#FFF5F5' : 'transparent',
                                    border: 'none',
                                    borderTop: i > 0 && p.value === 'custom' ? '1px solid #F0F0F5' : 'none',
                                    cursor: 'pointer', transition: 'background 0.1s', gap: 8,
                                }}
                                onMouseEnter={(e) => { if (preset !== p.value) e.currentTarget.style.background = '#F6F6F9'; }}
                                onMouseLeave={(e) => { if (preset !== p.value) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div>
                                    <div style={{ fontWeight: preset === p.value ? 600 : 500, color: preset === p.value ? '#FA4338' : '#3F4450', marginBottom: 1 }}>
                                        {p.label}
                                    </div>
                                </div>
                                {preset === p.value && <Check style={{ width: 14, height: 14, color: '#FA4338', flexShrink: 0 }} />}
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
    );
}

/* ─── Main Sidebar ─────────────────────────────────── */
export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    const pathname = usePathname();
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

    useEffect(() => {
        fetch('/api/config/logo')
            .then(res => {
                if (!res.ok) return null;
                return res.json();
            })
            .then(data => {
                if (data?.logoUrl) setLogoUrl(data.logoUrl);
            })
            .catch(() => { /* silently fall back to default logo */ });
    }, []);

    return (
        <nav
            className="sidebar"
            style={{
                width: sidebarWidth,
                transition: 'width 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                overflow: 'visible',
            }}
        >
            {/* ── Collapse/Expand Chevron — centered on right edge ── */}
            <button
                onClick={onToggle}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                style={{
                    position: 'absolute',
                    top: '50%',
                    right: -14,
                    transform: 'translateY(-50%)',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--bg-sidebar)',
                    border: '2px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#A4A9B6',
                    zIndex: 60,
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--gem)';
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.borderColor = 'var(--gem)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--bg-sidebar)';
                    e.currentTarget.style.color = '#A4A9B6';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                }}
            >
                {collapsed
                    ? <ChevronRight style={{ width: 14, height: 14 }} />
                    : <ChevronLeft style={{ width: 14, height: 14 }} />
                }
            </button>

            {/* ── Logo ── */}
            <div style={{
                padding: collapsed ? '20px 0 16px' : '20px 24px 16px',
                display: 'flex',
                justifyContent: 'center',
            }}>
                <Link href="/dashboard" className="flex items-center gap-3 no-underline" style={{ overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={logoUrl || "/logo.png"}
                        alt="Company Logo"
                        width={36}
                        height={36}
                        className="rounded-xl object-contain bg-white"
                        style={{ width: 36, height: 36, flexShrink: 0 }}
                    />
                    {!collapsed && (
                        <div>
                            <h1 className="text-lg font-bold text-white tracking-tight" style={{ lineHeight: 1.1 }}>No Cap</h1>
                            <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#A4A9B6' }}>ASC 350-40</p>
                        </div>
                    )}
                </Link>
            </div>

            {/* ── Search Trigger ── */}
            <div style={{ padding: collapsed ? '0 10px' : '0 16px', marginBottom: 12 }}>
                <button
                    onClick={() => {
                        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
                    }}
                    title="Search (⌘K)"
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        gap: 8,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 10,
                        padding: collapsed ? '10px 0' : '9px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#717684',
                        transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                >
                    <Search style={{ width: 14, height: 14, flexShrink: 0 }} />
                    {!collapsed && (
                        <>
                            <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
                            <kbd style={{
                                fontSize: 9, padding: '1px 5px', borderRadius: 4,
                                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                                color: '#717684', fontFamily: 'system-ui', fontWeight: 700,
                            }}>⌘K</kbd>
                        </>
                    )}
                </button>
            </div>

            {/* ── Navigation ── */}
            <div className="flex-1" style={{ padding: collapsed ? '0 6px' : '0 8px', overflowY: 'auto', overflowX: 'hidden' }}>
                {!collapsed && (
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#717684', paddingLeft: 20, marginBottom: 12 }}>
                        Navigation
                    </p>
                )}
                {navItems.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            title={collapsed ? item.label : undefined}
                            className={`sidebar-link ${isActive ? 'active' : ''}`}
                            style={collapsed ? {
                                justifyContent: 'center',
                                padding: '12px 0',
                                margin: '2px 4px',
                            } : undefined}
                        >
                            <item.icon className="w-[18px] h-[18px]" />
                            {!collapsed && <span>{item.label}</span>}
                        </Link>
                    );
                })}
            </div>

            {/* ── Period Selector ── */}
            <SidebarPeriodSelector collapsed={collapsed} />

            {/* ── Sign Out ── */}
            <div style={{ padding: collapsed ? '0 10px' : '0 16px', marginBottom: 8 }}>
                <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    title="Sign out"
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        gap: 8,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10,
                        padding: collapsed ? '10px 0' : '9px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#A4A9B6',
                        transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(250,67,56,0.12)';
                        e.currentTarget.style.color = '#FA4338';
                        e.currentTarget.style.borderColor = 'rgba(250,67,56,0.25)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                        e.currentTarget.style.color = '#A4A9B6';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    }}
                >
                    <LogOut style={{ width: 14, height: 14, flexShrink: 0 }} />
                    {!collapsed && <span>Sign Out</span>}
                </button>
            </div>


        </nav>
    );
}

export { SIDEBAR_EXPANDED, SIDEBAR_COLLAPSED };
