'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, ExternalLink, Zap, AlertCircle } from 'lucide-react';
import styles from './JiraTicketSlideOver.module.css';

interface JiraTicketData {
    ticketId: string;
    summary: string;
    status: string | null;
    statusCategory: string | null; // 'blue-grey' | 'yellow' | 'green' | 'red' etc.
    assigneeName: string | null;
    assigneeEmail: string | null;
    issueType: string | null;
    priority: string | null;
    storyPoints: number | null;
    resolutionDate: string | null;
    fixVersions: string[];
    labels: string[];
    description: string | null;
    parentKey: string | null;
    parentSummary: string | null;
    created: string | null;
    updated: string | null;
    jiraUrl: string;
}

interface Props {
    ticketKey: string | null;
    onClose: () => void;
}

function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusStyle(category: string | null): React.CSSProperties {
    switch (category) {
        case 'green':     return { background: '#EBF5EF', color: '#21944E' };
        case 'yellow':    return { background: '#FFF8E1', color: '#B07D00' };
        case 'blue-grey': return { background: '#F0F1F4', color: '#717684' };
        default:          return { background: '#F0F1F4', color: '#717684' };
    }
}

const ISSUE_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
    Story:    { bg: '#EBF5EF', color: '#21944E' },
    Bug:      { bg: '#FFF5F5', color: '#FA4338' },
    Task:     { bg: '#F0EAF8', color: '#4141A2' },
    Epic:     { bg: '#EDE9F7', color: '#6E40C9' },
    Subtask:  { bg: '#F6F6F9', color: '#717684' },
};

export function JiraTicketSlideOver({ ticketKey, onClose }: Props) {
    const [data, setData] = useState<JiraTicketData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTicket = useCallback(async (key: string) => {
        setLoading(true);
        setError(null);
        setData(null);

        try {
            const res = await fetch(`/api/integrations/jira/ticket/${encodeURIComponent(key)}`);
            const json = await res.json();

            if (!res.ok) {
                setError(json.error || 'Failed to load ticket from Jira.');
                return;
            }
            setData(json);
        } catch {
            setError('Network error — could not reach the server.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch whenever key changes
    useEffect(() => {
        if (ticketKey) {
            fetchTicket(ticketKey);
        } else {
            setData(null);
            setError(null);
        }
    }, [ticketKey, fetchTicket]);

    // Escape key handler
    useEffect(() => {
        if (!ticketKey) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [ticketKey, onClose]);

    if (!ticketKey) return null;

    const typeStyle = data?.issueType ? (ISSUE_TYPE_COLORS[data.issueType] ?? ISSUE_TYPE_COLORS.Task) : ISSUE_TYPE_COLORS.Task;

    return (
        <>
            {/* Backdrop */}
            <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

            {/* Panel */}
            <aside className={styles.panel} role="dialog" aria-modal="true" aria-label={`Jira ticket ${ticketKey}`}>

                {/* Header — always shown */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <span className={styles.ticketBadge}>{ticketKey}</span>
                        {data?.issueType && (
                            <span
                                className={styles.issueTypeBadge}
                                style={{ background: typeStyle.bg, color: typeStyle.color }}
                            >
                                {data.issueType}
                            </span>
                        )}
                    </div>
                    <div className={styles.headerActions}>
                        {data?.jiraUrl && (
                            <a
                                href={data.jiraUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.jiraLinkBtn}
                                title="Open in Jira"
                            >
                                <ExternalLink size={12} />
                                Open in Jira
                            </a>
                        )}
                        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Loading */}
                {loading && (
                    <div className={styles.loadingState}>
                        <div className={styles.spinner} />
                        <span>Fetching from Jira…</span>
                    </div>
                )}

                {/* Error */}
                {!loading && error && (
                    <div className={styles.errorState}>
                        <AlertCircle size={28} color="#FA4338" />
                        <p className={styles.errorTitle}>Could not load ticket</p>
                        <p className={styles.errorMessage}>{error}</p>
                        {error.includes('not configured') && (
                            <a
                                href="/integrations"
                                style={{ fontSize: 12, color: '#4141A2', fontWeight: 600, marginTop: 8 }}
                            >
                                Go to Integrations →
                            </a>
                        )}
                    </div>
                )}

                {/* Content */}
                {!loading && data && (
                    <div className={styles.body}>
                        {/* Summary */}
                        <p className={styles.summary}>{data.summary}</p>

                        {/* Status / Priority / SP */}
                        <div className={styles.metaRow}>
                            {data.status && (
                                <span
                                    className={styles.statusPill}
                                    style={statusStyle(data.statusCategory)}
                                >
                                    {data.status}
                                </span>
                            )}
                            {data.priority && (
                                <span className={styles.priorityBadge}>{data.priority}</span>
                            )}
                            {data.storyPoints != null && (
                                <span className={styles.spBadge}>
                                    <Zap size={11} />
                                    {data.storyPoints} SP
                                </span>
                            )}
                        </div>

                        {/* Assignee + Dates */}
                        <div className={`${styles.section} ${styles.twoCol}`}>
                            <div>
                                <p className={styles.sectionLabel}>Assignee</p>
                                <p className={styles.sectionValue}>{data.assigneeName ?? '—'}</p>
                                {data.assigneeEmail && (
                                    <p className={styles.sectionValueMuted}>{data.assigneeEmail}</p>
                                )}
                            </div>
                            <div>
                                <p className={styles.sectionLabel}>Resolution Date</p>
                                <p className={styles.sectionValue}>{formatDate(data.resolutionDate)}</p>
                            </div>
                        </div>

                        {/* Fix Version + Created */}
                        <div className={`${styles.section} ${styles.twoCol}`}>
                            <div>
                                <p className={styles.sectionLabel}>Fix Version</p>
                                <p className={styles.sectionValue}>
                                    {data.fixVersions.length > 0 ? data.fixVersions.join(', ') : '—'}
                                </p>
                            </div>
                            <div>
                                <p className={styles.sectionLabel}>Created</p>
                                <p className={styles.sectionValue}>{formatDate(data.created)}</p>
                            </div>
                        </div>

                        {/* Parent Epic */}
                        {data.parentKey && (
                            <div className={styles.section}>
                                <p className={styles.sectionLabel}>Parent</p>
                                <a
                                    href={`${data.jiraUrl.replace(/\/browse\/.*/, '')}/browse/${data.parentKey}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.parentLink}
                                >
                                    {data.parentKey}
                                    {data.parentSummary && (
                                        <span style={{ fontFamily: 'inherit', fontWeight: 400, color: '#717684' }}>
                                            &nbsp;— {data.parentSummary}
                                        </span>
                                    )}
                                    <ExternalLink size={10} />
                                </a>
                            </div>
                        )}

                        {/* Labels */}
                        {data.labels.length > 0 && (
                            <div className={styles.section}>
                                <p className={styles.sectionLabel}>Labels</p>
                                <div style={{ marginTop: 4 }}>
                                    {data.labels.map((l) => (
                                        <span key={l} className={styles.labelChip}>{l}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Description */}
                        {data.description && (
                            <div className={styles.section}>
                                <p className={styles.sectionLabel}>Description</p>
                                <p className={styles.description}>{data.description}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                {!loading && (
                    <div className={styles.footer}>
                        <p className={styles.footerNote}>
                            Live data from Jira · Last fetched just now ·{' '}
                            {data?.jiraUrl && (
                                <a href={data.jiraUrl} target="_blank" rel="noopener noreferrer">
                                    View {ticketKey} in Jira ↗
                                </a>
                            )}
                        </p>
                    </div>
                )}
            </aside>
        </>
    );
}
