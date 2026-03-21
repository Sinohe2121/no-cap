'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckSquare, Bug, ListTodo, Calendar, User, DollarSign, Ticket, TrendingDown, BookOpen, PlayCircle } from 'lucide-react';
import styles from './page.module.css';

interface Assignee {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface ProjectInfo {
    id: string;
    name: string;
    epicKey: string;
    status: string;
    amortizationMonths: number;
    launchDate: string | null;
}

interface AuditTrailEntry {
    id: string;
    allocatedAmount: number;
    developerName: string;
    period: { month: number; year: number } | null;
}

interface AmortRow {
    month: number;
    year: number;
    label: string;
    monthlyAmortization: number;
    cumulativeAmortization: number;
    netBookValue: number;
    isCurrent: boolean;
}

interface TicketDetail {
    ticket: {
        id: string;
        ticketId: string;
        epicKey: string;
        issueType: string;
        summary: string;
        storyPoints: number;
        resolutionDate: string | null;
        fixVersion: string | null;
        importPeriod: string | null;
        capitalizedAmount: number;
        amortizationMonths: number;
        createdAt: string;
        customFields?: Record<string, string> | null;
    };
    assignee: Assignee | null;
    project: ProjectInfo | null;
    auditTrails: AuditTrailEntry[];
    amortizationSchedule: AmortRow[];
}

const issueTypeConfig: Record<string, { icon: typeof Ticket; bg: string; color: string; label: string }> = {
    STORY: { icon: CheckSquare, bg: '#EBF5EF', color: '#21944E', label: 'Story' },
    BUG: { icon: Bug, bg: '#FFF5F5', color: '#FA4338', label: 'Bug' },
    TASK: { icon: ListTodo, bg: '#F0EAF8', color: '#4141A2', label: 'Task' },
};

function formatCurrency(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatPeriod(month: number, year: number) {
    return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function TicketDetailPage() {
    const params = useParams();
    const ticketId = params.id as string;
    const [data, setData] = useState<TicketDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/tickets/${ticketId}`)
            .then((res) => res.json())
            .then(setData)
            .finally(() => setLoading(false));
    }, [ticketId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!data || !data.ticket) {
        return (
            <div className="text-center py-20">
                <p className="text-sm" style={{ color: '#A4A9B6' }}>Ticket not found.</p>
                <Link href="/projects" className="btn-ghost text-xs mt-4 inline-flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> Back to Projects
                </Link>
            </div>
        );
    }

    const { ticket, assignee, project, auditTrails, amortizationSchedule } = data;
    const cfg = issueTypeConfig[ticket.issueType] || issueTypeConfig.TASK;
    const TypeIcon = cfg.icon;

    // Derive start date from Jira Created field or DB createdAt
    const startDateStr = ticket.customFields?.Created || ticket.createdAt;
    const startDate = startDateStr
        ? new Date(startDateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';

    // Derive resolve date
    const resolveDate = ticket.resolutionDate
        ? new Date(ticket.resolutionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';

    // Compute amortized-to-date and net book value from the schedule
    // Find the last row that is at or before the current month
    const now = new Date();
    const nowMonth = now.getMonth() + 1;
    const nowYear = now.getFullYear();
    const currentRow = amortizationSchedule
        .filter(r => r.year < nowYear || (r.year === nowYear && r.month <= nowMonth))
        .pop();
    const amortizedToDate = currentRow ? currentRow.cumulativeAmortization : 0;
    const netBookValue = currentRow ? currentRow.netBookValue : ticket.capitalizedAmount;

    // Check if this ticket was expensed outright (not capitalized)
    const totalAllocated = auditTrails.reduce((sum, at) => sum + at.allocatedAmount, 0);
    const isFullyExpensed = ticket.capitalizedAmount <= 0 && totalAllocated > 0;

    return (
        <div className={styles.pageWrapper}>
            {/* Back link */}
            <Link
                href={project ? `/projects/${project.id}/tickets` : '/projects'}
                className={styles.backLink}
            >
                <ArrowLeft className="w-3 h-3" />
                {project ? `${project.name} Tickets` : 'Projects'}
            </Link>

            {/* Header */}
            <div className={styles.headerRow}>
                <div>
                    <span className={styles.ticketIdBadge}>
                        <Ticket className="w-3.5 h-3.5" />
                        {ticket.ticketId}
                    </span>
                    <h1 className={styles.summaryText}>{ticket.summary}</h1>
                    <div className={styles.metaRow}>
                        <span
                            className={styles.typeBadge}
                            style={{ background: cfg.bg, color: cfg.color }}
                        >
                            <TypeIcon className="w-3 h-3" />
                            {cfg.label}
                        </span>
                        <span className={styles.metaDot} />
                        <span className={styles.metaLabel}>
                            {ticket.storyPoints} Story Point{ticket.storyPoints !== 1 ? 's' : ''}
                        </span>
                        {ticket.fixVersion && (
                            <>
                                <span className={styles.metaDot} />
                                <span className={styles.metaLabel}>{ticket.fixVersion}</span>
                            </>
                        )}
                        {ticket.resolutionDate && (
                            <>
                                <span className={styles.metaDot} />
                                <span className={styles.metaLabel}>
                                    Resolved {resolveDate}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Info Cards */}
            {isFullyExpensed ? (
                /* ── Fully Expensed ticket: 2 cards ─────────────────── */
                <div className={styles.cardsRow}>
                    <div className={styles.infoCard} data-accent="cilantro">
                        <div className={styles.cardLabel}>
                            <User className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Assigned Developer
                        </div>
                        <div className={styles.cardValue}>{assignee?.name || '—'}</div>
                        <div className={styles.cardSub}>{assignee?.role || '—'}</div>
                    </div>

                    <div className={styles.infoCard} data-accent="red">
                        <div className={styles.cardLabel}>
                            <DollarSign className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Fully Expensed
                        </div>
                        <div className={styles.cardValue}>{formatCurrency(totalAllocated)}</div>
                        <div className={styles.cardSub}>Expensed outright — not capitalized</div>
                    </div>
                </div>
            ) : (
                /* ── Capitalized ticket: 6 cards in 3-col grid ────── */
                <div className={styles.cardsRow} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className={styles.infoCard} data-accent="cilantro">
                        <div className={styles.cardLabel}>
                            <User className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Assigned Developer
                        </div>
                        <div className={styles.cardValue}>{assignee?.name || '—'}</div>
                        <div className={styles.cardSub}>{assignee?.role || '—'}</div>
                    </div>

                    <div className={styles.infoCard} data-accent="gem">
                        <div className={styles.cardLabel}>
                            <Calendar className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Start Date
                        </div>
                        <div className={styles.cardValue}>{startDate}</div>
                        <div className={styles.cardSub}>Ticket created in Jira</div>
                    </div>

                    <div className={styles.infoCard} data-accent="cilantro">
                        <div className={styles.cardLabel}>
                            <PlayCircle className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Resolve Date
                        </div>
                        <div className={styles.cardValue}>{resolveDate}</div>
                        <div className={styles.cardSub}>{ticket.resolutionDate ? 'Amortization trigger' : 'Not yet resolved'}</div>
                    </div>

                    <div className={styles.infoCard} data-accent="red">
                        <div className={styles.cardLabel}>
                            <DollarSign className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Capitalized Amount
                        </div>
                        <div className={styles.cardValue}>{formatCurrency(ticket.capitalizedAmount)}</div>
                        <div className={styles.cardSub}>
                            {ticket.amortizationMonths}-month useful life
                        </div>
                    </div>

                    <div className={styles.infoCard} data-accent="gem">
                        <div className={styles.cardLabel}>
                            <TrendingDown className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Amortized to Date
                        </div>
                        <div className={styles.cardValue}>{formatCurrency(amortizedToDate)}</div>
                        <div className={styles.cardSub}>
                            {formatCurrency(ticket.capitalizedAmount / ticket.amortizationMonths)}/mo depreciation
                        </div>
                    </div>

                    <div className={styles.infoCard} data-accent="cilantro">
                        <div className={styles.cardLabel}>
                            <BookOpen className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Net Book Value
                        </div>
                        <div className={styles.cardValue}>{formatCurrency(netBookValue)}</div>
                        <div className={styles.cardSub}>
                            {ticket.capitalizedAmount > 0
                                ? `${Math.round((netBookValue / ticket.capitalizedAmount) * 100)}% remaining`
                                : 'No capitalized cost'}
                        </div>
                    </div>
                </div>
            )}

            {/* Audit Trail (if any) */}
            {auditTrails.length > 0 && (
                <div className={styles.auditSection}>
                    <h2 className={styles.sectionTitle}>Cost Allocation History</h2>
                    <div className={styles.auditCards}>
                        {auditTrails.map((at) => (
                            <div key={at.id} className={styles.auditCard}>
                                <span className={styles.auditPeriod}>
                                    {at.period ? formatPeriod(at.period.month, at.period.year) : '—'}
                                </span>
                                <span className={styles.auditAmount}>{formatCurrency(at.allocatedAmount)}</span>
                                <span className={styles.auditDev}>{at.developerName}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Amortization Schedule */}
            <div className={styles.tableSection}>
                <h2 className={styles.sectionTitle}>Amortization Schedule</h2>

                {amortizationSchedule.length > 0 ? (
                    <div className={styles.tableWrapper}>
                        <table className={styles.amortTable}>
                            <thead>
                                <tr>
                                    <th>Month</th>
                                    <th>Monthly Amortization</th>
                                    <th>Cumulative Amortization</th>
                                    <th>Net Book Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {amortizationSchedule.map((row, i) => (
                                    <tr key={i} className={row.isCurrent ? styles.currentRow : undefined}>
                                        <td>
                                            {row.label}
                                            {row.isCurrent && <span className={styles.currentBadge}>Current</span>}
                                        </td>
                                        <td>{formatCurrency(row.monthlyAmortization)}</td>
                                        <td>{formatCurrency(row.cumulativeAmortization)}</td>
                                        <td>{formatCurrency(row.netBookValue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <div className={styles.emptyAmort}>
                            <p>Amortization has not started</p>
                            <p>
                                {ticket.resolutionDate
                                    ? 'Capitalized amount is $0 — no amortization to schedule.'
                                    : 'This ticket has not been resolved. Amortization begins the month after resolution.'}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
