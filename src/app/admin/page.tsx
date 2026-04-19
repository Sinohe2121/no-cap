'use client';

import Link from 'next/link';
import { 
    BookOpen, Settings, ImageIcon, 
    Users, RefreshCw, ShieldAlert, Shield, ArrowRight, Bot
} from 'lucide-react';

const ADMIN_CARDS = [
    {
        title: 'AI Configuration',
        desc: 'Connect OpenAI, Anthropic (Claude), or Google Gemini to enable one-click LLM-powered policy memo generation.',
        href: '/admin/llm-config',
        icon: Bot,
        color: '#7B61FF',
        bg: '#F3F0FF'
    },
    {
        title: 'Accounting Settings',
        desc: 'Controls whether the engine acts via ASC 350-40 GAAP constraints, ASU 2025-06, or IFRS. Includes fiscal year boundaries and logic matrix variables.',
        href: '/admin/accounting-standard',
        icon: BookOpen,
        color: '#21944E',
        bg: '#EBF5EF'
    },
    {
        title: 'System Branding',
        desc: 'Modify the global instance imagery, including custom logomark injection.',
        href: '/admin/branding',
        icon: ImageIcon,
        color: '#FA4338',
        bg: '#FFF4ED'
    },
    {
        title: 'User Management',
        desc: 'Modify user access layers, view audit trail signups, and toggle application-wide role provisioning.',
        href: '/admin/users',
        icon: Users,
        color: '#4141A2',
        bg: '#F5F3FF'
    },
    {
        title: 'Integrations',
        desc: 'Review pipeline syncs natively bounding BambooHR, Jira APIs, and system-wide extraction nodes.',
        href: '/integrations',
        icon: RefreshCw,
        color: '#21944E',
        bg: '#EBF5EF'
    },
    {
        title: 'Audit Intelligence',
        desc: 'Detect anomalies scaling against generic capitalization bounds natively within an automated SOC check.',
        href: '/audit',
        icon: ShieldAlert,
        color: '#FA4338',
        bg: '#FFF4ED'
    },
    {
        title: 'SOC 2 Readiness',
        desc: 'Generate immutable procedural trails documenting internal authorization and control matrices.',
        href: '/soc2',
        icon: Shield,
        color: '#4141A2',
        bg: '#EEF2FF'
    }
];

export default function AdminPortalPage() {
    return (
        <div className="pb-12">
            <div className="mb-8">
                <h1 className="section-header">Admin Portal</h1>
                <p className="section-subtext">Centralized management matrix spanning structural settings, system integrations, and compliance gating.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {ADMIN_CARDS.map((card, i) => (
                    <Link 
                        key={i} 
                        href={card.href}
                        className="group fintech-card p-6 flex flex-col justify-between transition-all hover:bg-[#F9FAFB]/50" 
                        style={{ minHeight: '180px' }}
                    >
                        <div className="flex items-start justify-between">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors" style={{ background: card.bg }}>
                                <card.icon className="w-6 h-6" style={{ color: card.color }} />
                            </div>
                            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" style={{ color: '#A4A9B6' }} />
                        </div>
                        <div>
                            <h3 className="text-[15px] font-black mb-1.5 mt-5" style={{ color: '#3F4450' }}>{card.title}</h3>
                            <p className="text-[13px] font-medium leading-relaxed" style={{ color: '#717684' }}>{card.desc}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
