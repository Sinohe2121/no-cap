'use client';

import { ArrowRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    ctaLabel?: string;
    ctaHref?: string;
    secondaryLabel?: string;
    secondaryHref?: string;
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    ctaLabel,
    ctaHref,
    secondaryLabel,
    secondaryHref,
}: EmptyStateProps) {
    return (
        <div
            className="rounded-2xl text-center py-16 px-8"
            style={{
                background: 'linear-gradient(180deg, #FAFBFC 0%, #F0F0F5 100%)',
                border: '1.5px dashed #D0D3DC',
            }}
        >
            {/* Icon cluster */}
            <div className="relative inline-flex items-center justify-center mb-6">
                <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{
                        background: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)',
                        boxShadow: '0 4px 16px rgba(65,65,162,0.1)',
                    }}
                >
                    <Icon className="w-7 h-7" style={{ color: '#4141A2' }} />
                </div>
                {/* Decorative dots */}
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full" style={{ background: '#A5D6A7' }} />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 rounded-full" style={{ background: '#FFE082' }} />
            </div>

            <h3 className="text-lg font-bold mb-2" style={{ color: '#3F4450' }}>{title}</h3>
            <p className="text-sm max-w-md mx-auto mb-6 leading-relaxed" style={{ color: '#A4A9B6' }}>
                {description}
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
                {ctaLabel && ctaHref && (
                    <Link href={ctaHref} className="btn-primary inline-flex items-center gap-2 no-underline">
                        {ctaLabel}
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                )}
                {secondaryLabel && secondaryHref && (
                    <Link href={secondaryHref} className="btn-secondary inline-flex items-center gap-2 no-underline">
                        {secondaryLabel}
                    </Link>
                )}
            </div>
        </div>
    );
}
