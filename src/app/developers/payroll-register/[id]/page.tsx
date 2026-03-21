'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';

interface Developer {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface EntryRow {
    developerId: string;
    grossSalary: number;
    sbcAmount: number;
}

interface PeriodDetail {
    id: string;
    label: string;
    payDate: string;
    year: number;
    fringeBenefitRate: number;
    entries: EntryRow[];
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}

function formatPercent(rate: number) {
    return `${(rate * 100).toFixed(1)}%`;
}

const roleMap: Record<string, string> = { ENG: 'Engineering', PRODUCT: 'Product', DESIGN: 'Design', QA: 'QA' };

export default function PayrollPeriodDetailPage() {
    const params = useParams();
    const periodId = params.id as string;

    const [period, setPeriod] = useState<PeriodDetail | null>(null);
    const [developers, setDevelopers] = useState<Developer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetch(`/api/payroll-register/period?id=${periodId}`).then(r => r.json()),
            fetch('/api/developers').then(r => r.json()),
        ])
        .then(([periodData, devData]) => {
            setPeriod(periodData);
            setDevelopers(Array.isArray(devData) ? devData : []);
        })
        .finally(() => setLoading(false));
    }, [periodId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!period) {
        return (
            <div>
                <div className="mb-4">
                    <Link href="/developers/payroll-register" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to Payroll Register
                    </Link>
                </div>
                <div className="glass-card p-12 text-center">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-4" style={{ color: '#A4A9B6' }} />
                    <h2 className="text-lg font-semibold mb-2" style={{ color: '#3F4450' }}>Period not found</h2>
                </div>
            </div>
        );
    }

    // Build a lookup map
    const devMap: Record<string, Developer> = {};
    developers.forEach(d => { devMap[d.id] = d; });

    const fringeRate = period.fringeBenefitRate ?? 0.25;

    const totalSalary = period.entries.reduce((s, e) => s + e.grossSalary, 0);
    const totalFringe = period.entries.reduce((s, e) => s + (e.grossSalary * fringeRate), 0);
    const totalSbc = period.entries.reduce((s, e) => s + (e.sbcAmount || 0), 0);
    const grandTotal = totalSalary + totalFringe + totalSbc;

    return (
        <div>
            <div className="mb-4">
                <Link href="/developers/payroll-register" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Payroll Register
                </Link>
            </div>

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="section-header">{period.label}</h1>
                    <p className="section-subtext">
                        Pay date: {new Date(period.payDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: '#A4A9B6' }}>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>{period.entries.length} entries · {formatCurrency(grandTotal)} total</span>
                </div>
            </div>

            {/* Fringe rate badge */}
            <div className="flex items-center gap-3 mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: '#F0F0FA', border: '1px solid #D8D8F0' }}>
                    <span className="text-xs font-medium" style={{ color: '#717684' }}>Fringe Benefit Rate</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: '#4141A2' }}>{formatPercent(fringeRate)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#E8E8F5', color: '#717684' }}>locked at import</span>
                </div>
            </div>

            <div className="glass-card overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Developer</th>
                            <th>Email</th>
                            <th>Team</th>
                            <th className="text-right">Gross Salary</th>
                            <th className="text-right">Fringe Benefits</th>
                            <th className="text-right">SBC</th>
                            <th className="text-right">Total Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {period.entries.map((entry) => {
                            const dev = devMap[entry.developerId];
                            const fringe = entry.grossSalary * fringeRate;
                            const sbc = entry.sbcAmount || 0;
                            const rowTotal = entry.grossSalary + fringe + sbc;
                            return (
                                <tr key={entry.developerId}>
                                    <td>
                                        <span className="font-medium" style={{ color: '#3F4450' }}>{dev?.name || 'Unknown'}</span>
                                    </td>
                                    <td style={{ color: '#717684' }}>{dev?.email || '—'}</td>
                                    <td style={{ color: '#717684' }}>{dev ? (roleMap[dev.role] || dev.role) : '—'}</td>
                                    <td className="text-right tabular-nums" style={{ color: '#3F4450' }}>
                                        {formatCurrency(entry.grossSalary)}
                                    </td>
                                    <td className="text-right tabular-nums" style={{ color: '#717684' }}>
                                        {formatCurrency(fringe)}
                                    </td>
                                    <td className="text-right tabular-nums" style={{ color: '#717684' }}>
                                        {sbc > 0 ? formatCurrency(sbc) : '—'}
                                    </td>
                                    <td className="text-right font-semibold tabular-nums" style={{ color: '#3F4450' }}>
                                        {formatCurrency(rowTotal)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #E2E4E9' }}>
                            <td className="font-bold" style={{ color: '#3F4450' }}>Total</td>
                            <td colSpan={2}></td>
                            <td className="text-right font-bold tabular-nums" style={{ color: '#3F4450' }}>
                                {formatCurrency(totalSalary)}
                            </td>
                            <td className="text-right font-bold tabular-nums" style={{ color: '#717684' }}>
                                {formatCurrency(totalFringe)}
                            </td>
                            <td className="text-right font-bold tabular-nums" style={{ color: '#717684' }}>
                                {formatCurrency(totalSbc)}
                            </td>
                            <td className="text-right font-bold tabular-nums" style={{ color: '#FA4338' }}>
                                {formatCurrency(grandTotal)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
