'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type WizardStep = 'payroll' | 'jira' | 'journal';

export const WIZARD_STEPS: { id: WizardStep; title: string; subtitle: string }[] = [
    { id: 'payroll', title: 'Import Payroll', subtitle: 'CSV for the next period' },
    { id: 'jira', title: 'Import Jira Tickets', subtitle: 'Same period, with classification rules' },
    { id: 'journal', title: 'Generate Journal Entry', subtitle: 'Review control totals & commit' },
];

interface PeriodTarget {
    month: number; // 1-12
    year: number;
    label: string; // e.g. "March 2026"
}

interface WizardState {
    /** Modal open + visible */
    visible: boolean;
    /** Wizard has been started but may be hidden (resume chip should appear) */
    active: boolean;
    currentStep: WizardStep;
    completed: WizardStep[];
    period: PeriodTarget | null;
}

interface WizardContextValue extends WizardState {
    open: () => void;
    close: () => void;            // hide but keep state (resumable)
    cancel: () => void;           // clear all state
    show: () => void;             // restore visibility
    setPeriod: (p: PeriodTarget) => void;
    goTo: (s: WizardStep) => void;
    markCompleted: (s: WizardStep) => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);
const STORAGE_KEY = 'nocap_wizard_state';

const DEFAULT: WizardState = {
    visible: false,
    active: false,
    currentStep: 'payroll',
    completed: [],
    period: null,
};

export function WizardProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<WizardState>(DEFAULT);

    useEffect(() => {
        try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<WizardState>;
                setState(s => ({ ...s, ...parsed, visible: false })); // never restore as visible
            }
        } catch {}
    }, []);

    const persist = useCallback((next: WizardState) => {
        try {
            if (typeof window === 'undefined') return;
            const { visible: _v, ...rest } = next;
            void _v;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
        } catch {}
    }, []);

    const update = useCallback((patch: Partial<WizardState> | ((s: WizardState) => Partial<WizardState>)) => {
        setState(prev => {
            const p = typeof patch === 'function' ? patch(prev) : patch;
            const next = { ...prev, ...p };
            persist(next);
            return next;
        });
    }, [persist]);

    const open = useCallback(() => update({ visible: true, active: true }), [update]);
    const close = useCallback(() => update({ visible: false }), [update]);
    const show = useCallback(() => update({ visible: true }), [update]);
    const cancel = useCallback(() => {
        try { if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY); } catch {}
        setState(DEFAULT);
    }, []);

    const setPeriod = useCallback((p: PeriodTarget) => update({ period: p }), [update]);
    const goTo = useCallback((s: WizardStep) => update({ currentStep: s }), [update]);
    const markCompleted = useCallback((s: WizardStep) => update(prev => ({
        completed: prev.completed.includes(s) ? prev.completed : [...prev.completed, s],
    })), [update]);

    return (
        <WizardContext.Provider value={{ ...state, open, close, show, cancel, setPeriod, goTo, markCompleted }}>
            {children}
        </WizardContext.Provider>
    );
}

export function useWizard() {
    const ctx = useContext(WizardContext);
    if (!ctx) throw new Error('useWizard must be used inside WizardProvider');
    return ctx;
}
