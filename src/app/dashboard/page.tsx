'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { DollarSign, TrendingDown, Users, FolderKanban, AlertTriangle, ArrowRight } from 'lucide-react';

interface DashboardData {
    summary: {
        totalAssetValue: number;
        ytdAmortization: number;
        activeDeveloperCount: number;
        totalProjects: number;
    };
    topProjects: { id: string; name: string; cost: number; status: string }[];
    chartData: { label: string; capex: number; opex: number; amortization: number }[];
    assetChartData: { label: string; capitalized: number; amortized: number; netAsset: number }[];
    alerts: { id: string; name: string; message: string }[];
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E4E9', borderRadius: 10, padding: 12, minWidth: 180 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#3F4450', marginBottom: 8 }}>{label}</p>
            {payload.map((entry: any, i: number) => (
                <div key={i} className="flex justify-between items-center gap-4" style={{ fontSize: 12 }}>
                    <span style={{ color: entry.color, fontWeight: 500 }}>{entry.name}</span>
                    <span style={{ color: '#3F4450', fontWeight: 600 }}>{formatCurrency(entry.value)}</span>
                </div>
            ))}
        </div>
    );
};

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/dashboard')
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

    if (!data) return null;

    const statCards = [
        { label: 'Total Asset Value', value: formatCurrency(data.summary.totalAssetValue), icon: DollarSign, accent: 'accent-cilantro', href: '/reports/asset-value' },
        { label: 'YTD Amortization', value: formatCurrency(data.summary.ytdAmortization), icon: TrendingDown, accent: 'accent-red', href: '/reports/ytd-amortization' },
        { label: 'Active Developers', value: data.summary.activeDeveloperCount.toString(), icon: Users, accent: 'accent-gem', href: '/developers' },
        { label: 'Total Projects', value: data.summary.totalProjects.toString(), icon: FolderKanban, accent: 'accent-carbon', href: '/projects' },
    ];

    return (
        <div>
            <div className="mb-8">
                <h1 className="section-header">Dashboard</h1>
                <p className="section-subtext">Software capitalization overview — ASC 350-40</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {statCards.map((card) => (
                    <Link key={card.label} href={card.href} className={`stat-card ${card.accent}`} style={{ textDecoration: 'none' }}>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>{card.label}</span>
                            <card.icon className="w-4 h-4" style={{ color: '#A4A9B6' }} />
                        </div>
                        <p className="text-2xl font-bold" style={{ color: '#3F4450' }}>{card.value}</p>
                    </Link>
                ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* CAPEX vs OPEX Line Chart */}
                <div className="glass-card p-6">
                    <h2 className="text-sm font-semibold mb-1" style={{ color: '#3F4450' }}>CAPEX vs. OPEX</h2>
                    <p className="text-xs mb-6" style={{ color: '#A4A9B6' }}>Monthly capitalized vs expensed costs</p>
                    <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={data.chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E4E9" />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#A4A9B6' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#A4A9B6' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                            <Line type="monotone" dataKey="capex" name="CAPEX" stroke="#4141A2" strokeWidth={2.5} dot={{ r: 4, fill: '#4141A2' }} />
                            <Line type="monotone" dataKey="opex" name="OPEX" stroke="#FA4338" strokeWidth={2.5} dot={{ r: 4, fill: '#FA4338' }} />
                            <Line type="monotone" dataKey="amortization" name="Amortization" stroke="#A4A9B6" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: '#A4A9B6' }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Top Projects Bar Chart */}
                <div className="glass-card p-6">
                    <h2 className="text-sm font-semibold mb-1" style={{ color: '#3F4450' }}>Top Capitalized Projects</h2>
                    <p className="text-xs mb-6" style={{ color: '#A4A9B6' }}>By total accumulated cost</p>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={data.topProjects} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E4E9" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#A4A9B6' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#717684' }} width={130} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="cost" name="Total Cost" fill="#4141A2" radius={[0, 6, 6, 0]} barSize={28} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Net Asset Value Chart */}
            {data.assetChartData && data.assetChartData.length > 0 && (
                <div className="glass-card p-6 mb-8">
                    <h2 className="text-sm font-semibold mb-1" style={{ color: '#3F4450' }}>Net Asset Value</h2>
                    <p className="text-xs mb-6" style={{ color: '#A4A9B6' }}>Running total capitalized cost, accumulated amortization &amp; net book value</p>
                    <ResponsiveContainer width="100%" height={340}>
                        <ComposedChart data={data.assetChartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E4E9" />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#A4A9B6' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#A4A9B6' }} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="capitalized" name="Capitalized" fill="#4141A2" radius={[4, 4, 0, 0]} barSize={40} />
                            <Bar dataKey="amortized" name="Amortized" fill="#FA4338" radius={[4, 4, 0, 0]} barSize={40} />
                            <Line type="monotone" dataKey="netAsset" name="Net Asset" stroke="#F5A623" strokeWidth={3} dot={{ r: 5, fill: '#F5A623', strokeWidth: 2, stroke: '#FFFFFF' }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Alerts */}
            {data.alerts.length > 0 && (
                <div className="glass-card p-6">
                    <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#3F4450' }}>
                        <AlertTriangle className="w-4 h-4" style={{ color: '#FA4338' }} />
                        Action Items
                    </h2>
                    <div className="space-y-3">
                        {data.alerts.map((alert) => (
                            <Link key={alert.id} href={`/projects/${alert.id}`} className="alert-card" style={{ textDecoration: 'none', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#FA4338' }} />
                                <div className="flex-1">
                                    <p className="text-sm" style={{ color: '#3F4450' }}>
                                        <span className="font-semibold">{alert.name}</span> is Live — set a launch date and verify the amortization schedule.
                                    </p>
                                </div>
                                <span className="flex items-center gap-1 text-xs font-medium flex-shrink-0" style={{ color: '#4141A2' }}>
                                    Review Project <ArrowRight className="w-3 h-3" />
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
