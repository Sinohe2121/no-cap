'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * B-L1: React error boundary to prevent unhandled component errors
 * from crashing entire pages.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <YourPage />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--color-text-secondary, #666)',
                }}>
                    <h2 style={{ marginBottom: '0.5rem', color: 'var(--color-text-primary, #333)' }}>
                        Something went wrong
                    </h2>
                    <p style={{ marginBottom: '1rem' }}>
                        An unexpected error occurred. Please try refreshing the page.
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border, #ddd)',
                            background: 'var(--color-bg-primary, #fff)',
                            cursor: 'pointer',
                        }}
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
