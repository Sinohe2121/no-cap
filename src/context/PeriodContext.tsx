'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type PeriodPreset = 'current_month' | 'last_month' | 'ytd' | 'last_fiscal_year' | 'all_time' | 'custom';

export interface PeriodRange {
    start: Date;
    end: Date;
}

export interface PeriodState {
    preset: PeriodPreset;
    customStart: string; // YYYY-MM-DD
    customEnd: string;   // YYYY-MM-DD
    range: PeriodRange;
    label: string;
    /** The fiscal year start month 1-12 (e.g. 2 = Feb) */
    fyStartMonth: number;
}

/**
 * Given a fiscal year start month (1=Jan, 2=Feb … 12=Dec) and the current date,
 * returns the boundaries of the *current* fiscal year.
 *
 * Example: fyStartMonth=2 (Feb), today=March 2026
 *   → current FY start = Feb 1 2026, end = Jan 31 2027
 *
 * Example: fyStartMonth=2, today=January 2026
 *   → current FY start = Feb 1 2025, end = Jan 31 2026  (we haven't started FY26 yet)
 */
function currentFyBounds(fyStartMonth: number, now: Date): { fyStart: Date; fyEnd: Date; fyLabel: string } {
    const m = now.getMonth() + 1; // 1-indexed current month
    const y = now.getFullYear();

    // Determine which FY year we're in
    // fyStartMonth=2: if current month >= 2 → FY starts this calendar year, else last year
    let fyYear: number;
    if (fyStartMonth === 1) {
        fyYear = y;
    } else {
        fyYear = m >= fyStartMonth ? y : y - 1;
    }

    const fyStart = new Date(fyYear, fyStartMonth - 1, 1); // month is 0-indexed
    // FY end = day before next FY start
    const nextFyStart = new Date(fyYear + 1, fyStartMonth - 1, 1);
    const fyEnd = new Date(nextFyStart.getTime() - 1); // one millisecond before next FY

    const fyLabel = fyStartMonth === 1 ? `FY ${fyYear}` : `FY ${fyYear}/${String(fyYear + 1).slice(2)}`;
    return { fyStart, fyEnd, fyLabel };
}

function computeRange(
    preset: PeriodPreset,
    customStart: string,
    customEnd: string,
    fyStartMonth: number,
    periodBounds: { oldestMonth: number; oldestYear: number; newestMonth: number; newestYear: number } | null,
): { range: PeriodRange; label: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed

    switch (preset) {
        case 'current_month': {
            const start = new Date(y, m, 1);
            const end = new Date(y, m + 1, 0, 23, 59, 59);
            const label = start.toLocaleString('default', { month: 'long', year: 'numeric' });
            return { range: { start, end }, label };
        }
        case 'last_month': {
            const start = new Date(y, m - 1, 1);
            const end = new Date(y, m, 0, 23, 59, 59);
            const label = start.toLocaleString('default', { month: 'long', year: 'numeric' });
            return { range: { start, end }, label };
        }
        case 'ytd': {
            // YTD = from start of the *current* fiscal year to today
            const { fyStart, fyLabel } = currentFyBounds(fyStartMonth, now);
            const end = new Date(y, m + 1, 0, 23, 59, 59); // end of current month
            return { range: { start: fyStart, end }, label: `YTD ${fyLabel}` };
        }
        case 'last_fiscal_year': {
            // Last FY = FY before the current one
            const { fyStart: curFyStart, fyLabel } = currentFyBounds(fyStartMonth, now);
            // Go back one day from current FY start to land in previous FY
            const dayBeforeCurFy = new Date(curFyStart.getTime() - 86400000);
            const { fyStart: prevFyStart, fyEnd: prevFyEnd, fyLabel: prevFyLabel } = currentFyBounds(fyStartMonth, dayBeforeCurFy);
            return { range: { start: prevFyStart, end: prevFyEnd }, label: prevFyLabel };
        }
        case 'all_time': {
            const start = periodBounds
                ? new Date(periodBounds.oldestYear, periodBounds.oldestMonth - 1, 1)
                : new Date(2000, 0, 1);
            const end = periodBounds
                ? new Date(periodBounds.newestYear, periodBounds.newestMonth, 0, 23, 59, 59)
                : new Date(y, m + 1, 0, 23, 59, 59);
            return { range: { start, end }, label: 'All Time' };
        }
        case 'custom': {
            if (customStart && customEnd) {
                const start = new Date(customStart + 'T00:00:00');
                const end = new Date(customEnd + 'T23:59:59');
                const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                return { range: { start, end }, label: `${fmt(start)} – ${fmt(end)}` };
            }
            // Fall back to current month if custom dates not set
            const start = new Date(y, m, 1);
            const end = new Date(y, m + 1, 0, 23, 59, 59);
            return { range: { start, end }, label: 'Custom Range' };
        }
    }
}

interface PeriodContextValue extends PeriodState {
    setPreset: (preset: PeriodPreset) => void;
    setCustomDates: (start: string, end: string) => void;
    /** ISO date strings ready to append to API calls */
    apiParams: string;
    /** Returns the 4 FY-aware quarters for the current fiscal year */
    fyQuarters: Array<{ label: string; start: Date; end: Date }>;
}

const PeriodContext = createContext<PeriodContextValue | null>(null);

const STORAGE_KEY = 'nocap_period';
const FY_STORAGE_KEY = 'nocap_fy_start_month';


/** Build the 4 FY-aware quarter ranges starting from fyStart date */
function buildFyQuarters(fyStart: Date): Array<{ label: string; start: Date; end: Date }> {
    const quarters = [];
    for (let q = 0; q < 4; q++) {
        const startMonth = fyStart.getMonth() + q * 3;
        const qStart = new Date(fyStart.getFullYear(), startMonth, 1);
        const qEnd = new Date(fyStart.getFullYear(), startMonth + 3, 0, 23, 59, 59);
        quarters.push({ label: `Q${q + 1}`, start: qStart, end: qEnd });
    }
    return quarters;
}

export function PeriodProvider({ children }: { children: React.ReactNode }) {
    const [preset, setPresetState] = useState<PeriodPreset>('current_month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [fyStartMonth, setFyStartMonth] = useState<number>(() => {
        // Read synchronously from localStorage so there's no render-flash
        // Guard against SSR (typeof window check prevents Vercel build crashes)
        try {
            if (typeof window !== 'undefined') {
                const v = localStorage.getItem(FY_STORAGE_KEY);
                if (v) return parseInt(v, 10) || 1;
            }
        } catch {}
        return 1;
    });
    const [periodBounds, setPeriodBounds] = useState<{ oldestMonth: number; oldestYear: number; newestMonth: number; newestYear: number } | null>(null);

    // Confirm with server and keep in sync
    useEffect(() => {
        fetch('/api/config/fiscal-year')
            .then((r) => r.json())
            .then((d) => {
                if (d.fiscalYearStartMonth) {
                    setFyStartMonth(d.fiscalYearStartMonth);
                    try { if (typeof window !== 'undefined') localStorage.setItem(FY_STORAGE_KEY, String(d.fiscalYearStartMonth)); } catch {}
                }
                if (d.periodBounds) {
                    setPeriodBounds(d.periodBounds);
                }
            })
            .catch(() => {});

        // Listen for changes made in the admin panel (same tab or other tabs)
        const onStorage = (e: StorageEvent) => {
            if (e.key === FY_STORAGE_KEY && e.newValue) {
                setFyStartMonth(parseInt(e.newValue, 10) || 1);
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);


    // Rehydrate from localStorage on mount
    useEffect(() => {
        try {
            if (typeof window !== 'undefined') {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const { preset: p, customStart: cs, customEnd: ce } = JSON.parse(stored);
                    if (p) setPresetState(p);
                    if (cs) setCustomStart(cs);
                    if (ce) setCustomEnd(ce);
                }
            }
        } catch {
            // ignore
        }
    }, []);

    const persist = useCallback((p: PeriodPreset, cs: string, ce: string) => {
        try { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: p, customStart: cs, customEnd: ce })); } catch {}
    }, []);

    const setPreset = useCallback((p: PeriodPreset) => {
        setPresetState(p);
        persist(p, customStart, customEnd);
    }, [customStart, customEnd, persist]);

    const setCustomDates = useCallback((start: string, end: string) => {
        setCustomStart(start);
        setCustomEnd(end);
        persist(preset, start, end);
    }, [preset, persist]);

    const { range, label } = computeRange(preset, customStart, customEnd, fyStartMonth, periodBounds);

    // IMPORTANT: use local date parts — toISOString() converts to UTC first,
    // which shifts dates for users in negative-offset timezones (e.g. UTC-7
    // turns Jan 31 23:59 local → Feb 1 UTC, adding a spurious extra month).
    const toISO = (d: Date) => {
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${mo}-${day}`;
    };
    const apiParams = `start=${toISO(range.start)}&end=${toISO(range.end)}`;

    // Build FY quarters based on current FY start
    const { fyStart } = currentFyBounds(fyStartMonth, new Date());
    const fyQuarters = buildFyQuarters(fyStart);

    return (
        <PeriodContext.Provider value={{
            preset, customStart, customEnd,
            range, label,
            fyStartMonth,
            setPreset, setCustomDates,
            apiParams,
            fyQuarters,
        }}>
            {children}
        </PeriodContext.Provider>
    );
}

export function usePeriod() {
    const ctx = useContext(PeriodContext);
    if (!ctx) throw new Error('usePeriod must be used inside PeriodProvider');
    return ctx;
}

/** Helper: compute FY quarter label for a given date */
export function getFyQuarterLabel(date: Date, fyStartMonth: number): string {
    const { fyStart } = currentFyBounds(fyStartMonth, date);
    const monthsIntoFy = (date.getFullYear() * 12 + date.getMonth()) - (fyStart.getFullYear() * 12 + fyStart.getMonth());
    const q = Math.floor(monthsIntoFy / 3) + 1;
    return `Q${Math.min(4, Math.max(1, q))}`;
}

// Export helper so server-side code can compute FY bounds from a stored month value
export { currentFyBounds };
