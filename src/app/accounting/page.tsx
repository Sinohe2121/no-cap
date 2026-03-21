'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart2, ArrowRight, Calculator, BookOpen, RefreshCw, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const MODULES = [
    {
        href: '/accounting/journal-entries',
        icon: Calculator,
        iconBg: '#F0EAF8',
        iconColor: '#4141A2',
        title: 'Journal Entries',
        description: 'Generate and review journal entries by accounting period. Audit capitalization, expensing, and amortization entries with full ticket-level drill-down.',
        highlights: ['Journal Entry Generator', 'Accounting Period Ledger', 'Audit Trail', 'Payroll Audit', 'CSV Export', 'Period Lock / Reopen'],
        accentColor: '#4141A2',
        accentBg: '#EEF2FF',
    },
    {
        href: '/accounting/financial-reporting',
        icon: BarChart2,
        iconBg: '#EBF5EF',
        iconColor: '#21944E',
        title: 'Financial Reporting',
        description: 'Monthly financial statement view with accounts on rows and months as columns. Balance sheet accounts show end-of-period balances; P&L accounts show period activity.',
        highlights: ['Software Asset (Balance Sheet)', 'Accumulated Amortization (Balance Sheet)', 'R&D Expense (P&L)', 'Amortization Expense (P&L)', 'Net Book Value', 'Multi-month columns'],
        accentColor: '#21944E',
        accentBg: '#EBF5EF',
    },
    {
        href: '/accounting/roll-forward',
        icon: RefreshCw,
        iconBg: '#FFF4E6',
        iconColor: '#F5A623',
        title: 'Roll-Forward Schedule',
        description: 'Standard auditor roll-forward: Beginning NBV + Period Additions − Period Amortization = Ending NBV, broken down by project with gross cost and accumulated amortization detail.',
        highlights: ['Per-Project Breakdown', 'Beginning / Ending NBV', 'Period Additions', 'Period Amortization', 'Legacy Balances', 'CSV Export'],
        accentColor: '#F5A623',
        accentBg: '#FFF4E6',
    },
];

export default function AccountingHubPage() {
    const [asuExpanded, setAsuExpanded] = useState(false);

    return (
        <div>
            <div className="mb-8">
                <h1 className="section-header">Accounting &amp; Reporting</h1>
                <p className="section-subtext">Journal entry management and financial statement views</p>
            </div>

            {/* ASU 2025-06 Readiness Matrix */}
            <div className="fintech-card mb-8 overflow-hidden">
                <button
                    onClick={() => setAsuExpanded(!asuExpanded)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#F9FAFB]/50 transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="w-4 h-4 text-[#4141A2]" />
                        <span className="text-[13px] font-bold uppercase tracking-wide text-[#4141A2]">ASU 2025-06 Readiness Matrix</span>
                        <Badge style={{ background: '#F5F3FF', color: '#4141A2', fontSize: 10, borderColor: '#E0DDF7' }}>Effective Dec 15, 2025</Badge>
                    </div>
                    {asuExpanded
                        ? <ChevronDown className="w-4 h-4 text-[#A4A9B6]" />
                        : <ChevronRight className="w-4 h-4 text-[#A4A9B6]" />
                    }
                </button>
                {asuExpanded && (
                    <div className="px-6 pb-6 pt-2 border-t border-[#E2E4E9]/40">
                        <p className="text-[13px] leading-relaxed mb-4 text-[#717684]">
                            FASB ASU 2025-06 simplifies software capitalization. All internal-use software costs are expensed <em>unless</em> management authorized the project and completion is probable.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-start gap-3 rounded-xl p-4 bg-[#F9FAFB] border border-[#E2E4E9]">
                                <div className="w-5 h-5 rounded-full bg-[#EBF5EF] flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-[10px] text-[#21944E] font-bold">✓</span>
                                </div>
                                <div>
                                    <p className="text-[12px] font-bold uppercase tracking-wide mb-1 text-[#3F4450]">Management Auth</p>
                                    <p className="text-[12px] text-[#A4A9B6]">Ensure project management sign-off is documented in system detail tabs.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 rounded-xl p-4 bg-[#F9FAFB] border border-[#E2E4E9]">
                                <div className="w-5 h-5 rounded-full bg-[#EBF5EF] flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-[10px] text-[#21944E] font-bold">✓</span>
                                </div>
                                <div>
                                    <p className="text-[12px] font-bold uppercase tracking-wide mb-1 text-[#3F4450]">Probable Completion</p>
                                    <p className="text-[12px] text-[#A4A9B6]">Management must assess that the software will be completed and utilized.</p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                            <Link href="/projects" className="text-[12px] font-bold text-[#4141A2] hover:text-[#2A2A8A] transition-colors flex items-center gap-1">
                                Review Active Projects <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {MODULES.map((mod) => {
                    const Icon = mod.icon;
                    return (
                        <Link
                            key={mod.href}
                            href={mod.href}
                            style={{ textDecoration: 'none' }}
                        >
                            <Card hoverable className="p-7 h-full">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-5">
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{ background: mod.iconBg }}
                                        >
                                            <Icon className="w-6 h-6" style={{ color: mod.iconColor }} />
                                        </div>
                                        <div>
                                            <h2 className="text-base font-bold" style={{ color: '#3F4450' }}>{mod.title}</h2>
                                            <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>
                                                {mod.highlights.length} features
                                            </p>
                                        </div>
                                    </div>
                                    <ArrowRight className="w-5 h-5 mt-1 flex-shrink-0" style={{ color: '#A4A9B6' }} />
                                </div>

                                {/* Description */}
                                <p className="text-sm mb-5" style={{ color: '#717684', lineHeight: 1.6 }}>
                                    {mod.description}
                                </p>

                                {/* Highlights */}
                                <div className="flex flex-wrap gap-2">
                                    {mod.highlights.map((h) => (
                                        <span
                                            key={h}
                                            className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                                            style={{ background: mod.accentBg, color: mod.accentColor }}
                                        >
                                            {h}
                                        </span>
                                    ))}
                                </div>

                                {/* CTA */}
                                <div
                                    className="mt-6 pt-5 flex items-center gap-2"
                                    style={{ borderTop: '1px solid #F0F0F5' }}
                                >
                                    <BookOpen className="w-3.5 h-3.5" style={{ color: mod.accentColor }} />
                                    <span className="text-xs font-semibold" style={{ color: mod.accentColor }}>
                                        Open {mod.title} →
                                    </span>
                                </div>
                            </Card>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
