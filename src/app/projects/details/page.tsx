'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Ticket, Download, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface TicketData {
    id: string;
    ticketId: string;
    epicKey: string;
    issueType: string;
    summary: string;
    storyPoints: number;
    resolutionDate: string;
    createdAt: string;
    assignee: { id: string; name: string } | null;
    project: { id: string; name: string } | null;
    allocatedCost?: number;
    customFields?: any;
    importPeriod?: string;
}

const MONTH_ORDER = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function periodSortKey(period: string): number {
    // "February 2026" -> sortable number 202602
    const parts = period.split(' ');
    if (parts.length !== 2) return 0;
    const monthIdx = MONTH_ORDER.indexOf(parts[0]);
    const year = parseInt(parts[1], 10);
    if (monthIdx < 0 || isNaN(year)) return 0;
    return year * 100 + (monthIdx + 1);
}

export default function ProjectDetailsPage() {
    const router = useRouter();
    const [tickets, setTickets] = useState<TicketData[]>([]);
    const [customFieldsConfig, setCustomFieldsConfig] = useState<{ id: string, name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [collapsedPeriods, setCollapsedPeriods] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetch('/api/tickets')
            .then((res) => res.json())
            .then(d => { setTickets(d.tickets); setCustomFieldsConfig(d.customFieldsConfig || []); })
            .finally(() => setLoading(false));
    }, []);

    // Group tickets by importPeriod, sorted newest first
    const periodGroups = useMemo(() => {
        const groups: Record<string, TicketData[]> = {};
        tickets.forEach(t => {
            const period = t.importPeriod || 'Uncategorized';
            if (!groups[period]) groups[period] = [];
            groups[period].push(t);
        });

        return Object.entries(groups)
            .sort(([a], [b]) => periodSortKey(b) - periodSortKey(a))
            .map(([period, tix]) => ({ period, tickets: tix }));
    }, [tickets]);

    const togglePeriod = (period: string) => {
        setCollapsedPeriods(prev => {
            const next = new Set(prev);
            if (next.has(period)) next.delete(period);
            else next.add(period);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    const dynamicColumns = customFieldsConfig.map(f => f.name);

    return (
        <div>
            <div className="mb-4">
                <Link href="/projects" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Projects
                </Link>
            </div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-header">Project Details & Import</h1>
                    <p className="section-subtext">Manage and import Jira tickets</p>
                </div>
                <Button onClick={() => router.push('/projects/import')}>
                    <Download className="w-4 h-4" /> Import Period
                </Button>
            </div>

            {periodGroups.length === 0 && (
                <Card className="p-12 text-center">
                    <Ticket className="w-8 h-8 mx-auto mb-3" style={{ color: '#A4A9B6' }} />
                    <p className="text-sm" style={{ color: '#717684' }}>No tickets have been imported yet. Click "Import Period" to begin.</p>
                </Card>
            )}

            <div className="flex flex-col gap-4">
                {periodGroups.map(({ period, tickets: groupTickets }) => {
                    const isCollapsed = collapsedPeriods.has(period);
                    const totalSP = groupTickets.reduce((s, t) => s + t.storyPoints, 0);
                    const storyCount = groupTickets.filter(t => t.issueType.toUpperCase() === 'STORY').length;
                    const bugCount = groupTickets.filter(t => t.issueType.toUpperCase() === 'BUG').length;

                    return (
                        <Card key={period} className="overflow-hidden">
                            {/* Collapsible header */}
                            <button
                                onClick={() => togglePeriod(period)}
                                className="w-full flex items-center justify-between p-5 text-left transition-colors"
                                style={{ background: 'transparent' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFBFC')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                                <div className="flex items-center gap-3">
                                    {isCollapsed ? (
                                        <ChevronRight className="w-4 h-4" style={{ color: '#A4A9B6' }} />
                                    ) : (
                                        <ChevronDown className="w-4 h-4" style={{ color: '#4141A2' }} />
                                    )}
                                    <Ticket className="w-4 h-4" style={{ color: '#A4A9B6' }} />
                                    <span className="text-sm font-bold" style={{ color: '#3F4450' }}>{period}</span>
                                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#F0EAF8', color: '#4141A2' }}>
                                        {groupTickets.length} tickets
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs" style={{ color: '#A4A9B6' }}>
                                        <span className="font-semibold" style={{ color: '#4141A2' }}>{totalSP}</span> SP
                                    </span>
                                    <span className="text-xs" style={{ color: '#A4A9B6' }}>
                                        <span className="font-semibold" style={{ color: '#21944E' }}>{storyCount}</span> stories
                                    </span>
                                    <span className="text-xs" style={{ color: '#A4A9B6' }}>
                                        <span className="font-semibold" style={{ color: '#FA4338' }}>{bugCount}</span> bugs
                                    </span>
                                </div>
                            </button>

                            {/* Table body */}
                            {!isCollapsed && (
                                <div style={{ overflowX: 'auto', borderTop: '1px solid #E2E4E9' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                {customFieldsConfig.map(col => (
                                                    <th key={col.id} style={{ textTransform: 'uppercase' }}>
                                                        {col.name}
                                                    </th>
                                                ))}
                                                <th className="text-right">Allocated Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groupTickets.map((ticket) => (
                                                <tr key={ticket.id}>
                                                    {customFieldsConfig.map(col => {
                                                        let val = ticket.customFields?.[col.name];
                                                        if (!val) {
                                                            if (col.id === 'issuekey') val = ticket.ticketId;
                                                            if (col.id === 'issuetype') val = ticket.issueType;
                                                            if (col.id === 'summary') val = ticket.summary;
                                                            if (col.id === 'customfield_10115' || col.id === 'customfield_10016' || col.id === 'customfield_10014') val = String(ticket.storyPoints);
                                                            if (col.id === 'assignee') val = ticket.assignee?.name;
                                                        }

                                                        if (col.id === 'issuetype' && val) {
                                                            const upperVal = String(val).toUpperCase();
                                                            return (
                                                                <td key={col.id}>
                                                                    <span className="badge" style={{
                                                                        background: upperVal === 'STORY' ? '#EBF5EF' : upperVal === 'BUG' ? '#FFF5F5' : '#F0EAF8',
                                                                        color: upperVal === 'STORY' ? '#21944E' : upperVal === 'BUG' ? '#FA4338' : '#4141A2',
                                                                    }}>
                                                                        {upperVal}
                                                                    </span>
                                                                </td>
                                                            );
                                                        }
                                                        if (col.id === 'issuekey' && val) {
                                                            return <td key={col.id}><span className="text-xs font-mono" style={{ color: '#4141A2' }}>{val}</span></td>
                                                        }
                                                        return (
                                                            <td key={col.id} className="text-sm max-w-[200px] truncate" title={val || ''}>
                                                                {val || '-'}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="text-right font-semibold" style={{ color: '#21944E' }}>{ticket.allocatedCost ? formatCurrency(ticket.allocatedCost) : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
