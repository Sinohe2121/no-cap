'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, DollarSign, TrendingDown } from 'lucide-react';

interface ReportRow {
    id: string;
    name: string;
    status: string;
    totalCost: number;
    launchDate: string | null;
    accumulatedAmortization?: number;
    netBookValue?: number;
    monthlyAmortization?: number;
    ytdAmount?: number;
}

interface ReportData {
    title: string;
    subtitle: string;
    rows: ReportRow[];
    total: number;
}

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const STATUS: Record<string, { bg: string; fg: string }> = {
    PLANNING: { bg: '#FFF9E6', fg: '#D3D236' },
    DEV: { bg: '#F0EAF8', fg: '#4141A2' },
    LIVE: { bg: '#EBF5EF', fg: '#21944E' },
    RETIRED: { bg: '#F6F6F9', fg: '#717684' },
};

/* ── Shared cell style for numbers ── */
const numCell: React.CSSProperties = {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    paddingRight: 24,
};

export default function ReportPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const isAssetValue = slug === 'asset-value';

    useEffect(() => {
        fetch(`/api/reports/${slug}`)
            .then((r) => r.json())
            .then(setData)
            .finally(() => setLoading(false));
    }, [slug]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!data || data.rows.length === 0) {
        return (
            <div className="text-center py-20">
                <p className="text-sm" style={{ color: '#A4A9B6' }}>No data available for this report.</p>
                <Link href="/dashboard" className="btn-ghost text-xs mt-4 inline-flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> Back to Dashboard
                </Link>
            </div>
        );
    }

    const Icon = isAssetValue ? DollarSign : TrendingDown;
    const accent = isAssetValue ? '#21944E' : '#FA4338';

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <Link href="/dashboard" className="text-xs flex items-center gap-1 mb-2" style={{ color: '#A4A9B6', textDecoration: 'none' }}>
                        <ArrowLeft className="w-3 h-3" /> Dashboard
                    </Link>
                    <h1 className="section-header flex items-center gap-2">
                        <Icon className="w-5 h-5" style={{ color: accent }} />
                        {data.title}
                    </h1>
                    <p className="section-subtext">{data.subtitle}</p>
                </div>
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E4E9',
                    borderRadius: 14,
                    padding: '16px 28px',
                    textAlign: 'right',
                }}>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A4A9B6', marginBottom: 4 }}>Total</span>
                    <span style={{ fontSize: 24, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>{fmt(data.total)}</span>
                </div>
            </div>

            {/* Report table */}
            <div className="glass-card" style={{ overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #E2E4E9' }}>
                            <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A4A9B6', width: '30%' }}>
                                Project
                            </th>
                            <th style={{ textAlign: 'left', padding: '14px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A4A9B6', width: '10%' }}>
                                Status
                            </th>
                            <th style={{ textAlign: 'right', padding: '14px 24px 14px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A4A9B6', width: '20%' }}>
                                Total Cost
                            </th>
                            <th style={{ textAlign: 'right', padding: '14px 24px 14px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A4A9B6', width: '20%' }}>
                                {isAssetValue ? 'Accumulated Amortization' : 'Monthly Amortization'}
                            </th>
                            <th style={{ textAlign: 'right', padding: '14px 24px 14px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A4A9B6', width: '20%' }}>
                                {isAssetValue ? 'Net Book Value' : 'YTD Amount'}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row) => {
                            const s = STATUS[row.status] || STATUS.RETIRED;
                            return (
                                <tr
                                    key={row.id}
                                    onClick={() => router.push(`/projects/${row.id}`)}
                                    style={{ borderBottom: '1px solid #F0F1F4', cursor: 'pointer', transition: 'background 0.12s' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8F8FB')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <td style={{ padding: '16px 16px' }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#3F4450' }}>{row.name}</div>
                                        <div style={{ fontSize: 11, color: '#A4A9B6', marginTop: 2 }}>{fmtDate(row.launchDate)}</div>
                                    </td>
                                    <td style={{ padding: '16px 12px' }}>
                                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: s.bg, color: s.fg }}>
                                            {row.status}
                                        </span>
                                    </td>
                                    <td style={{ ...numCell, padding: '16px 24px 16px 12px' }}>
                                        <span style={{ fontSize: 14, color: '#3F4450' }}>{fmt(row.totalCost)}</span>
                                    </td>
                                    <td style={{ ...numCell, padding: '16px 24px 16px 12px' }}>
                                        <span style={{ fontSize: 14, color: '#FA4338' }}>
                                            {isAssetValue
                                                ? fmt(row.accumulatedAmortization ?? 0)
                                                : fmt(row.monthlyAmortization ?? 0)}
                                        </span>
                                    </td>
                                    <td style={{ ...numCell, padding: '16px 24px 16px 12px' }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: accent }}>
                                            {isAssetValue
                                                ? fmt(row.netBookValue ?? 0)
                                                : fmt(row.ytdAmount ?? 0)}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Total footer */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: 16,
                    padding: '14px 24px',
                    background: '#F8F8FB',
                    borderTop: '2px solid #E2E4E9',
                }}>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A4A9B6' }}>
                        Total
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(data.total)}
                    </span>
                </div>
            </div>
        </div>
    );
}
