'use client';

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Use red styling for the confirm button (destructive actions). */
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Styled replacement for `window.confirm()`. Use this anywhere you need a
 * yes/no confirmation so the app stays visually consistent across browsers.
 */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter') onConfirm();
        };
        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = original;
            window.removeEventListener('keydown', onKey);
        };
    }, [open, onCancel, onConfirm]);

    if (!open) return null;

    const accent = danger ? '#FA4338' : '#4141A2';
    const accentBg = danger ? '#FFF5F5' : '#F0EAF8';

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(15,17,25,0.55)', backdropFilter: 'blur(6px)', padding: 24 }}
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <div
                className="glass-card flex flex-col"
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                style={{
                    width: 'min(440px, 100%)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.3)',
                    padding: 0,
                }}
            >
                {/* Header */}
                <div
                    className="flex items-start justify-between gap-3"
                    style={{ padding: '20px 24px 12px', flexShrink: 0 }}
                >
                    <div className="flex items-start gap-3">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: accentBg }}
                        >
                            <AlertTriangle className="w-5 h-5" style={{ color: accent }} />
                        </div>
                        <h2
                            id="confirm-dialog-title"
                            className="text-base font-bold"
                            style={{ color: '#3F4450', paddingTop: 8 }}
                        >
                            {title}
                        </h2>
                    </div>
                    <button onClick={onCancel} className="btn-ghost" style={{ padding: 6 }} title="Close">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '0 24px 20px 64px' }}>
                    <p className="text-sm" style={{ color: '#717684', lineHeight: 1.5 }}>
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div
                    className="flex items-center justify-end gap-2"
                    style={{ padding: '14px 24px', borderTop: '1px solid #E2E4E9', flexShrink: 0 }}
                >
                    <button onClick={onCancel} className="btn-ghost text-xs">
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="btn-primary text-xs"
                        style={danger ? { background: '#FA4338' } : undefined}
                        autoFocus
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
