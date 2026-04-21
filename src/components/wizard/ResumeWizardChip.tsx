'use client';

import { useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { useWizard, WIZARD_STEPS } from '@/context/WizardContext';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function ResumeWizardChip() {
    const { active, visible, currentStep, period, show, cancel } = useWizard();
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    if (!active || visible) return null;

    const step = WIZARD_STEPS.find(s => s.id === currentStep);
    const idx = WIZARD_STEPS.findIndex(s => s.id === currentStep);

    return (
        <>
        <div
            style={{
                position: 'fixed',
                bottom: 24,
                right: 24,
                zIndex: 90,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 6px 6px 14px',
                background: '#FA4338',
                color: '#fff',
                borderRadius: 999,
                boxShadow: '0 12px 30px rgba(250,67,56,0.35), 0 4px 12px rgba(0,0,0,0.15)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'default',
            }}
        >
            <CalendarDays className="w-3.5 h-3.5" style={{ marginRight: 4, opacity: 0.9 }} />
            <button
                onClick={show}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 4px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    lineHeight: 1.15,
                }}
            >
                <span>Resume Next Period Wizard</span>
                <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>
                    {period?.label ?? 'No period yet'} · Step {idx + 1} of {WIZARD_STEPS.length}: {step?.title}
                </span>
            </button>
            <button
                onClick={() => setShowCancelConfirm(true)}
                title="Cancel wizard"
                style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.18)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 4,
                }}
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>

        <ConfirmDialog
            open={showCancelConfirm}
            title="Cancel the wizard?"
            message="Your progress in this session will be cleared. Imports already committed (payroll, Jira tickets, journal entries) will not be undone."
            confirmLabel="Yes, cancel"
            cancelLabel="Keep working"
            danger
            onConfirm={() => { setShowCancelConfirm(false); cancel(); }}
            onCancel={() => setShowCancelConfirm(false)}
        />
        </>
    );
}
