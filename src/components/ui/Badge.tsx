import React from 'react';

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement>;

export function Badge({ children, className = '', style, ...props }: BadgeProps) {
    return (
        <span className={`badge ${className}`} style={style} {...props}>
            {children}
        </span>
    );
}

export function StatusBadge({ status, className = '', children }: { status: string; className?: string, children?: React.ReactNode }) {
    const colors: Record<string, string> = {
        PLANNING: 'border-[#D3D236] text-[#3F4450]',
        DEV: 'border-[#4141A2] text-[#4141A2]',
        LIVE: 'border-[#21944E] text-[#21944E]',
        RETIRED: 'border-[#A4A9B6] text-[#717684]',
        OPEN: 'border-[#4141A2] text-[#4141A2]',
        CLOSED: 'border-[#A4A9B6] text-[#717684]',
    };

    const statusUpper = status.toUpperCase();
    
    return (
        <span className={`badge border bg-white ${colors[statusUpper] || colors.RETIRED} ${className}`}>
            {status}
            {children}
        </span>
    );
}

export function TypeBadge({ type, className = '' }: { type: string; className?: string }) {
    const typeUpper = type.toUpperCase();
    const bg = typeUpper === 'CAPITALIZATION' ? '#EBF5EF' : typeUpper === 'AMORTIZATION' ? '#F0EAF8' : '#FFF5F5';
    const color = typeUpper === 'CAPITALIZATION' ? '#21944E' : typeUpper === 'AMORTIZATION' ? '#4141A2' : '#FA4338';
    
    return (
        <span className={`badge ${className}`} style={{ background: bg, color }}>
            {type}
        </span>
    );
}
