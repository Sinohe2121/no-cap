'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar, { SIDEBAR_EXPANDED, SIDEBAR_COLLAPSED } from '@/components/Sidebar';
import { GlobalSearch } from '@/components/GlobalSearch';
import { PeriodProvider } from '@/context/PeriodContext';

const AUTH_ROUTES = ['/login', '/api/auth'];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAuthPage = AUTH_ROUTES.some(r => pathname.startsWith(r));
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const marginLeft = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

    if (isAuthPage) {
        return <>{children}</>;
    }

    return (
        <PeriodProvider>
            <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
            <GlobalSearch />
            <main
                className="main-content"
                style={{
                    marginLeft,
                    width: `calc(100% - ${marginLeft}px)`,
                    transition: 'margin-left 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), width 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
            >
                {children}
            </main>
        </PeriodProvider>
    );
}
