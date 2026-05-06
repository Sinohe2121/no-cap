'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { JiraTicketSlideOver } from './JiraTicketSlideOver';

const JiraTicketPanelContext = createContext<{ open: (ticketId: string) => void } | null>(null);

export function JiraTicketPanelProvider({ children }: { children: React.ReactNode }) {
    const [ticketKey, setTicketKey] = useState<string | null>(null);
    const open = useCallback((id: string) => setTicketKey(id), []);
    const close = useCallback(() => setTicketKey(null), []);

    return (
        <JiraTicketPanelContext.Provider value={{ open }}>
            {children}
            <JiraTicketSlideOver ticketKey={ticketKey} onClose={close} />
        </JiraTicketPanelContext.Provider>
    );
}

function useJiraTicketPanel() {
    return useContext(JiraTicketPanelContext);
}

interface LinkProps {
    ticketId: string;
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
}

// Drop-in replacement for any Jira ticket-id badge. Renders as a button that
// opens the shared side panel; falls back to a plain span if the provider is
// missing (so pages that haven't been wrapped yet don't crash).
export function JiraTicketLink({ ticketId, className, style, children }: LinkProps) {
    const ctx = useJiraTicketPanel();
    const baseStyle: React.CSSProperties = {
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        color: 'inherit',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textDecorationColor: 'currentColor',
        textUnderlineOffset: 3,
        ...style,
    };

    if (!ctx) {
        return <span className={className} style={style}>{children ?? ticketId}</span>;
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                ctx.open(ticketId);
            }}
            title="Preview in Jira"
            className={className}
            style={baseStyle}
        >
            {children ?? ticketId}
        </button>
    );
}
