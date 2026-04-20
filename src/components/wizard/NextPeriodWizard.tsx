'use client';

import { useEffect } from 'react';
import { Check, X, CalendarDays, FileSpreadsheet, GitPullRequest, BookOpen } from 'lucide-react';
import { useWizard, WIZARD_STEPS, WizardStep } from '@/context/WizardContext';
import Step1Payroll from './steps/Step1Payroll';
import Step2Jira from './steps/Step2Jira';
import Step3Journal from './steps/Step3Journal';

const STEP_ICONS: Record<WizardStep, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    payroll: FileSpreadsheet,
    jira: GitPullRequest,
    journal: BookOpen,
};

export default function NextPeriodWizard() {
    const { visible, currentStep, completed, period, close, cancel, goTo } = useWizard();

    // Lock body scroll while open
    useEffect(() => {
        if (!visible) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = original; };
    }, [visible]);

    if (!visible) return null;

    const currentIdx = WIZARD_STEPS.findIndex(s => s.id === currentStep);

    const renderStep = () => {
        switch (currentStep) {
            case 'payroll': return <Step1Payroll />;
            case 'jira': return <Step2Jira />;
            case 'journal': return <Step3Journal />;
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: 'rgba(15,17,25,0.55)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
            <div
                className="glass-card flex"
                style={{
                    width: 'min(1100px, 95vw)',
                    height: 'min(720px, 92vh)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                    padding: 0,
                }}
            >
                {/* ── Left: flow chart ── */}
                <div
                    style={{
                        width: 280,
                        flexShrink: 0,
                        background: 'linear-gradient(180deg, #1F2230 0%, #2A2D3F 100%)',
                        color: '#fff',
                        padding: '28px 22px',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <CalendarDays className="w-4 h-4" style={{ color: '#A4A9B6' }} />
                        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#A4A9B6' }}>
                            Next Period Wizard
                        </p>
                    </div>
                    <h2 className="text-lg font-bold mb-1" style={{ lineHeight: 1.2 }}>
                        {period ? period.label : 'Select a period'}
                    </h2>
                    <p className="text-[11px] mb-7" style={{ color: '#A4A9B6' }}>
                        Walk through payroll, Jira and journal entry creation.
                    </p>

                    <div style={{ position: 'relative', flex: 1 }}>
                        {/* Connector line */}
                        <div
                            style={{
                                position: 'absolute',
                                left: 19,
                                top: 18,
                                bottom: 18,
                                width: 2,
                                background: 'rgba(255,255,255,0.12)',
                            }}
                        />
                        {WIZARD_STEPS.map((s, i) => {
                            const Icon = STEP_ICONS[s.id];
                            const isActive = s.id === currentStep;
                            const isDone = completed.includes(s.id);
                            const isReachable = isDone || isActive || i <= currentIdx;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => isReachable && goTo(s.id)}
                                    disabled={!isReachable}
                                    style={{
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 12,
                                        width: '100%',
                                        padding: '10px 8px',
                                        marginBottom: 4,
                                        background: isActive ? 'rgba(250,67,56,0.12)' : 'transparent',
                                        border: 'none',
                                        borderRadius: 10,
                                        cursor: isReachable ? 'pointer' : 'default',
                                        textAlign: 'left',
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 38,
                                            height: 38,
                                            borderRadius: '50%',
                                            background: isDone ? '#21944E' : isActive ? '#FA4338' : 'rgba(255,255,255,0.08)',
                                            border: `2px solid ${isDone ? '#21944E' : isActive ? '#FA4338' : 'rgba(255,255,255,0.18)'}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#fff',
                                            flexShrink: 0,
                                            zIndex: 1,
                                        }}
                                    >
                                        {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                                    </div>
                                    <div style={{ paddingTop: 4 }}>
                                        <p className="text-xs font-semibold" style={{ color: isActive ? '#fff' : isDone ? '#fff' : '#C2C5D0' }}>
                                            Step {i + 1}
                                        </p>
                                        <p className="text-sm font-bold" style={{ color: isActive || isDone ? '#fff' : '#A4A9B6', lineHeight: 1.25 }}>
                                            {s.title}
                                        </p>
                                        <p className="text-[11px] mt-0.5" style={{ color: '#717684', lineHeight: 1.35 }}>
                                            {s.subtitle}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => {
                            if (window.confirm('Cancel the wizard? Your progress in this session will be cleared.')) {
                                cancel();
                            }
                        }}
                        className="text-[11px] font-medium"
                        style={{
                            color: '#A4A9B6',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 8,
                            padding: '8px 12px',
                            cursor: 'pointer',
                            marginTop: 16,
                            transition: 'all 0.15s',
                        }}
                    >
                        Cancel wizard
                    </button>
                </div>

                {/* ── Right: step content ── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#FFFFFF' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '18px 28px',
                            borderBottom: '1px solid #E2E4E9',
                        }}
                    >
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#A4A9B6' }}>
                                Step {currentIdx + 1} of {WIZARD_STEPS.length}
                            </p>
                            <h3 className="text-base font-bold" style={{ color: '#3F4450' }}>
                                {WIZARD_STEPS[currentIdx].title}
                            </h3>
                        </div>
                        <button
                            onClick={close}
                            title="Hide wizard (resumable)"
                            className="btn-ghost"
                            style={{ padding: 6 }}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                        {renderStep()}
                    </div>
                </div>
            </div>
        </div>
    );
}
