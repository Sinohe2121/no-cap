import { format, parseISO } from 'date-fns';

export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

export function formatCurrencyFull(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

export function formatDate(date: Date | string | null): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'MMM d, yyyy');
}

export function formatMonth(month: number, year: number): string {
    return format(new Date(year, month - 1, 1), 'MMM yyyy');
}

export function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

export function statusColor(status: string): string {
    switch (status) {
        case 'PLANNING': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        case 'DEV': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        case 'LIVE': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
        case 'RETIRED': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
        case 'OPEN': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        case 'CLOSED': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
        default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
}

export function issueTypeColor(type: string): string {
    switch (type) {
        case 'STORY': return 'bg-emerald-500/20 text-emerald-400';
        case 'BUG': return 'bg-red-500/20 text-red-400';
        case 'TASK': return 'bg-violet-500/20 text-violet-400';
        default: return 'bg-slate-500/20 text-slate-400';
    }
}

export function roleColor(role: string): string {
    switch (role) {
        case 'ENG': return 'bg-cyan-500/20 text-cyan-400';
        case 'PRODUCT': return 'bg-fuchsia-500/20 text-fuchsia-400';
        case 'DESIGN': return 'bg-orange-500/20 text-orange-400';
        default: return 'bg-slate-500/20 text-slate-400';
    }
}
