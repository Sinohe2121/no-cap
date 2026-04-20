'use client';

import { useEffect, useState } from 'react';

interface Stage {
    /** seconds at which this stage becomes active (cumulative) */
    at: number;
    label: string;
}

interface Props {
    title: string;
    subtitle?: string;
    stages: Stage[];
    /** caps the indeterminate progress bar (0-100). Defaults to 92. */
    cap?: number;
    /** approximate time the operation usually takes, in seconds, used to scale fake progress */
    expectedSeconds?: number;
}

function fmtElapsed(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function LoadingPanel({ title, subtitle, stages, cap = 92, expectedSeconds = 30 }: Props) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const t = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(t);
    }, []);

    // Find the latest stage whose `at` <= elapsed
    const stage = [...stages].reverse().find(s => s.at <= elapsed) || stages[0];

    // Asymptotic fake progress: never reaches 100, slows over time
    // p(t) = cap * (1 - exp(-t / expectedSeconds))
    const pct = Math.min(cap, cap * (1 - Math.exp(-elapsed / expectedSeconds)));

    return (
        <div
            className="rounded-2xl flex flex-col items-center justify-center text-center"
            style={{
                background: 'linear-gradient(180deg, #FAFAFE 0%, #F4F4FA 100%)',
                border: '1px solid #E2E4E9',
                padding: '40px 32px',
                minHeight: 320,
            }}
        >
            {/* Animated radial gauge */}
            <div style={{ position: 'relative', width: 96, height: 96, marginBottom: 20 }}>
                <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
                    {/* track */}
                    <circle cx="48" cy="48" r="42" fill="none" stroke="#E2E4E9" strokeWidth="6" />
                    {/* progress */}
                    <circle
                        cx="48"
                        cy="48"
                        r="42"
                        fill="none"
                        stroke="url(#wizardLoadGrad)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${(pct / 100) * (2 * Math.PI * 42)} ${2 * Math.PI * 42}`}
                        style={{ transition: 'stroke-dasharray 1s linear' }}
                    />
                    <defs>
                        <linearGradient id="wizardLoadGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#4141A2" />
                            <stop offset="100%" stopColor="#FA4338" />
                        </linearGradient>
                    </defs>
                </svg>
                {/* indeterminate spinning ring */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 14,
                        borderRadius: '50%',
                        border: '2px solid transparent',
                        borderTopColor: '#4141A2',
                        borderRightColor: 'rgba(65,65,162,0.4)',
                        animation: 'wizardLoadSpin 1.1s linear infinite',
                    }}
                />
                {/* elapsed in middle */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        color: '#3F4450',
                    }}
                >
                    <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>{fmtElapsed(elapsed)}</span>
                    <span style={{ fontSize: 9, color: '#A4A9B6', marginTop: 2, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>elapsed</span>
                </div>
            </div>

            <h3 className="text-sm font-bold" style={{ color: '#3F4450', marginBottom: 4 }}>{title}</h3>
            <p className="text-xs" style={{ color: '#717684', maxWidth: 380, lineHeight: 1.5 }}>
                {stage.label}
            </p>

            {subtitle && (
                <p className="text-[11px] mt-4" style={{ color: '#A4A9B6', maxWidth: 380, lineHeight: 1.5 }}>
                    {subtitle}
                </p>
            )}

            {/* Linear progress under everything */}
            <div style={{ width: '100%', maxWidth: 380, marginTop: 24, height: 4, background: '#E2E4E9', borderRadius: 999, overflow: 'hidden' }}>
                <div
                    style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #4141A2 0%, #FA4338 100%)',
                        transition: 'width 1s linear',
                    }}
                />
            </div>
            <p className="text-[10px] mt-2 font-semibold uppercase tracking-widest" style={{ color: '#A4A9B6' }}>
                {Math.round(pct)}% · indeterminate
            </p>

            <style>{`@keyframes wizardLoadSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
