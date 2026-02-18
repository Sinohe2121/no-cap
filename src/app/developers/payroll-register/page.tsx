'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';

interface Developer {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface PayrollImportRef {
    id: string;
    label: string;
    payDate: string;
    year: number;
}

interface RegisterData {
    developers: Developer[];
    payrollImports: PayrollImportRef[];
    salaryMap: Record<string, Record<string, number>>;
    importTotals: Record<string, number>;
    devTotals: Record<string, number>;
    grandTotal: number;
    yearLabel: string;
}

function formatCurrency(amount: number) {
    if (amount === 0) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function formatCurrencyAlways(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

const roleMap: Record<string, string> = {
    ENG: 'Engineering',
    PRODUCT: 'Product',
    DESIGN: 'Design',
    QA: 'QA',
};

const subTeamMap: Record<string, string> = {
    ENG: 'Platform',
    PRODUCT: 'Growth',
    DESIGN: 'UX',
    QA: 'QA',
};

export default function PayrollRegisterPage() {

    const [data, setData] = useState<RegisterData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/payroll-register')
            .then((res) => res.json())
            .then(setData)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!data || data.payrollImports.length === 0) {
        return (
            <div>
                <Link href="/developers" className="btn-ghost mb-6">
                    <ArrowLeft className="w-4 h-4" /> Back to FTE & Payroll
                </Link>
                <div className="glass-card p-12 text-center">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-4" style={{ color: '#A4A9B6' }} />
                    <h2 className="text-lg font-semibold mb-2" style={{ color: '#3F4450' }}>No Payroll Data</h2>
                    <p className="text-sm" style={{ color: '#A4A9B6' }}>Import payroll data from the Integrations page to populate the register.</p>
                </div>
            </div>
        );
    }

    const { developers, payrollImports, salaryMap, importTotals, devTotals, grandTotal, yearLabel } = data;

    return (
        <div>
            <Link href="/developers" className="btn-ghost mb-6">
                <ArrowLeft className="w-4 h-4" /> Back to FTE & Payroll
            </Link>

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-header">Payroll Register</h1>
                    <p className="section-subtext">Gross salary by pay period across all developers</p>
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: '#A4A9B6' }}>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>{payrollImports.length} pay periods · {developers.length} developers</span>
                </div>
            </div>

            <div className="glass-card overflow-x-auto">
                <table className="w-full border-collapse text-sm" style={{ minWidth: 800 }}>
                    <thead>
                        {/* Pay date header row */}
                        <tr style={{ borderBottom: '1px solid #E2E4E9' }}>
                            <th className="sticky left-0 z-10 px-4 py-3 text-left" style={{ background: '#FFFFFF', minWidth: 120 }}></th>
                            <th className="px-3 py-3 text-left" style={{ minWidth: 130 }}></th>
                            <th className="px-3 py-3 text-left" style={{ minWidth: 100 }}></th>
                            <th className="px-3 py-3 text-left" style={{ minWidth: 80 }}></th>
                            {payrollImports.map((imp) => (
                                <th
                                    key={imp.id}
                                    className="px-4 py-3 text-right font-semibold whitespace-nowrap"
                                    style={{ color: '#3F4450', fontSize: 12, minWidth: 100 }}
                                >
                                    {imp.label}
                                </th>
                            ))}
                            <th className="px-4 py-3 text-right font-bold whitespace-nowrap" style={{ color: '#3F4450', fontSize: 12, minWidth: 110 }}>
                                {yearLabel}
                            </th>
                        </tr>
                        {/* Column labels */}
                        <tr style={{ borderBottom: '2px solid #E2E4E9' }}>
                            <th className="sticky left-0 z-10 px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', background: '#FFFFFF' }}>Name</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Title</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Team</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Sub team</th>
                            {payrollImports.map((imp) => (
                                <th key={imp.id} className="px-4 py-2" />
                            ))}
                            <th className="px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {developers.map((dev) => (
                            <tr key={dev.id} className="transition-colors" style={{ borderBottom: '1px solid #E2E4E9' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F6F9')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                                <td className="sticky left-0 z-10 px-4 py-3 font-medium whitespace-nowrap" style={{ color: '#3F4450', background: 'inherit' }}>
                                    {dev.name}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#717684' }}>
                                    {dev.role === 'ENG' ? 'Software Engineer' : dev.role === 'PRODUCT' ? 'Product Manager' : dev.role === 'DESIGN' ? 'Designer' : dev.role}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#717684' }}>
                                    {roleMap[dev.role] || dev.role}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#717684' }}>
                                    {subTeamMap[dev.role] || '—'}
                                </td>
                                {payrollImports.map((imp) => {
                                    const val = salaryMap[dev.id]?.[imp.id] || 0;
                                    return (
                                        <td key={imp.id} className="px-4 py-3 text-right tabular-nums" style={{ color: val > 0 ? '#3F4450' : '#A4A9B6' }}>
                                            {formatCurrency(val)}
                                        </td>
                                    );
                                })}
                                <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: '#3F4450' }}>
                                    {formatCurrencyAlways(devTotals[dev.id] || 0)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #E2E4E9' }}>
                            <td className="sticky left-0 z-10 px-4 py-3 font-bold" style={{ color: '#3F4450', background: '#FFFFFF' }}>Total</td>
                            <td colSpan={3}></td>
                            {payrollImports.map((imp) => (
                                <td key={imp.id} className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: '#3F4450' }}>
                                    {formatCurrencyAlways(importTotals[imp.id] || 0)}
                                </td>
                            ))}
                            <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: '#FA4338' }}>
                                {formatCurrencyAlways(grandTotal)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
