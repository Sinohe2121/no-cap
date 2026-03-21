'use client';

import { useEffect } from 'react';

// Fix #26 — global error boundary for the Next.js App Router.
// This catches unhandled render errors anywhere in the app and shows
// a graceful recovery screen instead of a blank/white crash page.
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log to your error monitoring service here (Sentry, Datadog, etc.)
        console.error('[GlobalError]', error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#F6F6F9',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                margin: 0,
            }}>
                <div style={{
                    textAlign: 'center',
                    maxWidth: 480,
                    padding: '40px 32px',
                    background: '#fff',
                    borderRadius: 16,
                    border: '1px solid #E2E4E9',
                    boxShadow: '0 2px 16px rgba(63,68,80,0.08)',
                }}>
                    {/* Error icon */}
                    <div style={{
                        width: 56,
                        height: 56,
                        background: 'rgba(250,67,56,0.1)',
                        borderRadius: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FA4338" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>

                    <h1 style={{ fontSize: 20, fontWeight: 700, color: '#3F4450', margin: '0 0 8px' }}>
                        Something went wrong
                    </h1>
                    <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 24px', lineHeight: 1.6 }}>
                        An unexpected error occurred. Our team has been notified.
                        {error.digest && (
                            <span style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#A4A9B6', fontFamily: 'monospace' }}>
                                Error ID: {error.digest}
                            </span>
                        )}
                    </p>

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                        <button
                            onClick={reset}
                            style={{
                                padding: '10px 20px',
                                background: '#FA4338',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Try again
                        </button>
                        <button
                            onClick={() => window.location.href = '/dashboard'}
                            style={{
                                padding: '10px 20px',
                                background: '#F6F6F9',
                                color: '#3F4450',
                                border: '1px solid #E2E4E9',
                                borderRadius: 8,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
