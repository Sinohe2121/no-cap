'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, ArrowRight, FileSpreadsheet } from 'lucide-react';

interface Developer {
    id: string;
    name: string;
    email: string;
    jiraUserId: string;
    role: string;
    isActive: boolean;
    monthlySalary: number;
    fringeBenefitRate: number;
    stockCompAllocation: number;
    loadedCost: number;
    totalPoints: number;
    capPoints: number;
    expPoints: number;
    capRatio: number;
    ticketCount: number;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

export default function DevelopersPage() {
    const [developers, setDevelopers] = useState<Developer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/developers')
            .then((res) => res.json())
            .then(setDevelopers)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-header">FTE & Payroll</h1>
                    <p className="section-subtext">Developer costs and capitalization allocation</p>
                </div>
                <div className="flex items-center gap-4">
                    <Link href="/developers/payroll-register" className="btn-ghost text-xs">
                        <FileSpreadsheet className="w-4 h-4" /> Payroll Register
                    </Link>
                    <div className="flex items-center gap-2 text-xs" style={{ color: '#A4A9B6' }}>
                        <Users className="w-4 h-4" />
                        <span>{developers.length} developers</span>
                    </div>
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Developer</th>
                            <th>Role</th>
                            <th className="text-right">Monthly Salary</th>
                            <th className="text-right">Loaded Cost</th>
                            <th className="text-right">Cap %</th>
                            <th className="text-right">Exp %</th>
                            <th>Allocation</th>
                            <th className="text-right">Tickets</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {developers.map((dev) => {
                            const capPct = (dev.capRatio * 100).toFixed(1);
                            const expPct = ((1 - dev.capRatio) * 100).toFixed(1);
                            return (
                                <tr key={dev.id}>
                                    <td>
                                        <div>
                                            <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{dev.name}</p>
                                            <p className="text-xs" style={{ color: '#A4A9B6' }}>{dev.email}</p>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="badge" style={{
                                            background: dev.role === 'ENG' ? '#E8F4F8' : dev.role === 'PRODUCT' ? '#F0EAF8' : '#FFF3E0',
                                            color: dev.role === 'ENG' ? '#4141A2' : dev.role === 'PRODUCT' ? '#4141A2' : '#FA4338',
                                        }}>
                                            {dev.role}
                                        </span>
                                    </td>
                                    <td className="text-right text-sm">{formatCurrency(dev.monthlySalary)}</td>
                                    <td className="text-right text-sm font-semibold" style={{ color: '#3F4450' }}>{formatCurrency(dev.loadedCost)}</td>
                                    <td className="text-right">
                                        <span className="text-sm font-semibold" style={{ color: '#21944E' }}>{capPct}%</span>
                                    </td>
                                    <td className="text-right">
                                        <span className="text-sm font-semibold" style={{ color: '#FA4338' }}>{expPct}%</span>
                                    </td>
                                    <td>
                                        <div className="w-full h-2 rounded-full overflow-hidden flex" style={{ minWidth: 100, background: '#E2E4E9' }}>
                                            <div className="h-full transition-all" style={{ width: `${capPct}%`, background: '#21944E' }} />
                                            <div className="h-full transition-all" style={{ width: `${expPct}%`, background: '#FA4338' }} />
                                        </div>
                                    </td>
                                    <td className="text-right text-sm">{dev.ticketCount}</td>
                                    <td>
                                        <Link href={`/developers/${dev.id}`} className="btn-ghost text-xs">
                                            Details <ArrowRight className="w-3 h-3" />
                                        </Link>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
