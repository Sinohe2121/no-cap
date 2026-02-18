'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    FolderKanban,
    Users,
    RefreshCw,
    Ticket,
    BookOpen,
    Settings,
} from 'lucide-react';

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/developers', label: 'FTE & Payroll', icon: Users },
    { href: '/integrations', label: 'Integrations', icon: RefreshCw },
    { href: '/tickets', label: 'Tickets', icon: Ticket },
    { href: '/accounting', label: 'Accounting', icon: BookOpen },
    { href: '/admin', label: 'Admin', icon: Settings },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <nav className="sidebar">
            <div className="p-6 pb-8">
                <Link href="/dashboard" className="flex items-center gap-3 no-underline">
                    <img src="/logo.png" alt="No Cap" className="w-10 h-10 rounded-xl" />
                    <div>
                        <h1 className="text-lg font-bold text-white tracking-tight">No Cap</h1>
                        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#A4A9B6' }}>ASC 350-40</p>
                    </div>
                </Link>
            </div>

            <div className="flex-1 px-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest px-5 mb-3" style={{ color: '#717684' }}>Navigation</p>
                {navItems.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`sidebar-link ${isActive ? 'active' : ''}`}
                        >
                            <item.icon className="w-[18px] h-[18px]" />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </div>

            <div className="p-4 m-3 rounded-xl border" style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <p className="text-xs font-semibold" style={{ color: '#FA4338' }}>Software Cap Tool</p>
                <p className="text-[11px] mt-1" style={{ color: '#A4A9B6' }}>Internal-use software cost capitalization & amortization</p>
            </div>
        </nav>
    );
}
