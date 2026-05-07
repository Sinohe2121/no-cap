'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
    X,
    FolderKanban,
    GitCommit,
    UserPlus,
    PlayCircle,
    ExternalLink,
    Download,
    Activity,
} from 'lucide-react';

interface AssetSummary {
    id: string;
    name: string;
    epicKey: string;
    status: string;
    costBasis: number;
    netBookValue: number;
    accumulatedAmortization: number;
    monthlyAmortizationRate: number;
    usefulLifeMonths: number;
    monthsRemaining: number | null;
    fullyAmortized: boolean;
    ticketCount: number;
    capThisPeriod: number;
}

interface ProjectDetail {
    id: string;
    name: string;
    description: string | null;
    epicKey: string;
    status: string;
    isCapitalizable: boolean;
    launchDate: string | null;
    startDate: string | null;
    accumulatedCost: number;
    tickets: {
        id: string;
        ticketId: string;
        issueType: string;
        summary: string;
        storyPoints: number;
        resolutionDate: string | null;
        createdAt: string;
        customFields: Record<string, unknown> | null;
        assigneeId: string | null;
        assignee: { id: string; name: string; role: string } | null;
    }[];
    developers: {
        id: string;
        name: string;
        role: string;
        ticketCount: number;
        totalPoints: number;
        storyPoints: number;
    }[];
}

const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

interface Props {
    asset: AssetSummary | null;  // null = drawer closed
    onClose: () => void;
}

export default function AssetDrawer({ asset, onClose }: Props) {
    const [detail, setDetail] = useState<ProjectDetail | null>(null);
    const [loading, setLoading] = useState(false);

    // Lock body scroll while drawer is open and bind Esc-to-close.
    useEffect(() => {
        if (!asset) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKey);
        };
    }, [asset, onClose]);

    // Fetch enriched detail whenever a new asset is selected. We piggyback on
    // /api/projects/[id] which already returns tickets + dev contributions.
    useEffect(() => {
        if (!asset) { setDetail(null); return; }
        setLoading(true);
        fetch(`/api/projects/${asset.id}`)
            .then((r) => r.ok ? r.json() : null)
            .then(setDetail)
            .finally(() => setLoading(false));
    }, [asset?.id]);

    // Derive top contributors and the per-engineer activity heatmap from the
    // tickets list. The heatmap counts tickets created per week for the top 5
    // contributors over the trailing 12 weeks — matches the github-style grid
    // pattern from the design pack.
    const heatmap = useMemo(() => {
        if (!detail) return null;
        const top = [...detail.developers]
            .sort((a, b) => b.ticketCount - a.ticketCount)
            .slice(0, 5);
        const NUM_WEEKS = 12;
        const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const weekStarts: number[] = [];
        for (let i = NUM_WEEKS - 1; i >= 0; i--) {
            weekStarts.push(now - (i + 1) * MS_WEEK);
        }
        const weekLabels = weekStarts.map((ms) =>
            new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        );
        const rows = top.map((dev) => {
            const counts = new Array(NUM_WEEKS).fill(0);
            for (const t of detail.tickets) {
                if (t.assigneeId !== dev.id) continue;
                const created = (t.customFields && typeof t.customFields === 'object' && 'Created' in t.customFields)
                    ? new Date((t.customFields as Record<string, string>).Created).getTime()
                    : new Date(t.createdAt).getTime();
                if (isNaN(created)) continue;
                const idx = NUM_WEEKS - 1 - Math.floor((now - created) / MS_WEEK);
                if (idx >= 0 && idx < NUM_WEEKS) counts[idx]++;
            }
            return { developerId: dev.id, name: dev.name, ticketCount: dev.ticketCount, totalPoints: dev.totalPoints, counts };
        });
        const max = Math.max(1, ...rows.flatMap((r) => r.counts));
        return { rows, weekLabels, max };
    }, [detail]);

    if (!asset) return null;

    const phase: 'in-service' | 'dev' | 'pre-launch' =
        asset.status === 'LIVE' ? 'in-service'
            : asset.status === 'PLANNING' ? 'pre-launch'
                : 'dev';
    const phaseLabel = phase === 'in-service' ? 'In Service' : phase === 'pre-launch' ? 'Pre-launch' : 'In Development';
    const phaseColor = phase === 'in-service' ? 'var(--envoy-cilantro)' : phase === 'pre-launch' ? 'var(--envoy-pistachio)' : 'var(--envoy-gem)';
    const ftesCount = detail ? detail.developers.length : 0;

    const ftesAndTickets = `${ftesCount} / ${asset.ticketCount}`;
    const monthsLeft = asset.fullyAmortized ? 'Fully amortized' : asset.monthsRemaining !== null ? `${asset.monthsRemaining} mo remaining` : `${asset.usefulLifeMonths} mo life`;

    return (
        <>
            {/* Scrim */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(63, 68, 80, 0.4)',
                    zIndex: 90,
                    animation: 'asset-drawer-fade 200ms var(--ease-standard, ease)',
                }}
            />

            <aside style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(560px, 95vw)',
                background: 'var(--bg-surface)',
                borderLeft: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 91,
                overflow: 'auto',
                animation: 'asset-drawer-slide 240ms var(--ease-emphasized, ease)',
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{
                            width: 40, height: 40,
                            borderRadius: 8,
                            background: 'var(--bg-surface-2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <FolderKanban style={{ width: 18, height: 18, color: 'var(--fg-1)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="eyebrow" style={{ marginBottom: 2 }}>
                                {asset.epicKey} · {asset.status}
                            </p>
                            <h2 style={{
                                fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em',
                                color: 'var(--fg-1)', lineHeight: 1.2, wordBreak: 'break-word',
                            }}>
                                {asset.name}
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            style={{
                                width: 32, height: 32,
                                background: 'transparent',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 8,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer',
                                color: 'var(--fg-2)',
                                flexShrink: 0,
                            }}
                        >
                            <X style={{ width: 16, height: 16 }} />
                        </button>
                    </div>

                    {detail?.description && (
                        <p style={{ fontSize: 13, color: 'var(--fg-2)', margin: '12px 0 0', lineHeight: 1.5 }}>
                            {detail.description}
                        </p>
                    )}

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '3px 10px',
                            fontSize: 11, fontWeight: 600,
                            background: `${phaseColor}1A`, color: phaseColor,
                            borderRadius: 999,
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: 999, background: phaseColor }} />
                            {phaseLabel}
                        </span>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '3px 10px',
                            fontSize: 11, fontWeight: 600,
                            background: 'var(--bg-page)', color: 'var(--fg-1)',
                            borderRadius: 999,
                        }}>
                            {asset.usefulLifeMonths} mo life
                        </span>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '3px 10px',
                            fontSize: 11, fontWeight: 600,
                            background: 'var(--bg-page)', color: 'var(--fg-1)',
                            borderRadius: 999,
                        }}>
                            {monthsLeft}
                        </span>
                    </div>
                </div>

                {/* Stats grid */}
                <div style={{ padding: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                        <DrawerStat label="Cost basis" value={fmtUSD(asset.costBasis)} />
                        <DrawerStat label="Net book value" value={fmtUSD(asset.netBookValue)} color="var(--envoy-cilantro)" />
                        <DrawerStat label="Accum. amort." value={fmtUSD(asset.accumulatedAmortization)} />
                        <DrawerStat label="Monthly burn" value={fmtUSD(asset.monthlyAmortizationRate)} />
                        <DrawerStat label="Cap. this period" value={fmtUSD(asset.capThisPeriod)} color="var(--envoy-gem)" />
                        <DrawerStat label="FTEs / tickets" value={ftesAndTickets} />
                    </div>

                    {/* Top contributors */}
                    <div style={{ marginBottom: 24 }}>
                        <p className="eyebrow">Top engineering contributors</p>
                        <div style={{ marginTop: 8 }}>
                            {loading && <p style={{ fontSize: 12, color: 'var(--fg-3)' }}>Loading…</p>}
                            {!loading && detail && (() => {
                                const top = [...detail.developers].sort((a, b) => b.ticketCount - a.ticketCount).slice(0, 5);
                                if (top.length === 0) return <p style={{ fontSize: 12, color: 'var(--fg-3)' }}>No assigned tickets in this period.</p>;
                                const max = Math.max(...top.map((d) => d.ticketCount));
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {top.map((dev) => (
                                            <div key={dev.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', alignItems: 'center', gap: 10, fontSize: 13 }}>
                                                <span style={{ fontWeight: 600, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dev.name}>
                                                    {dev.name}
                                                    <span style={{ color: 'var(--fg-3)', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>{dev.role}</span>
                                                </span>
                                                <div style={{ height: 8, position: 'relative', background: 'var(--bg-surface-2)', borderRadius: 999 }}>
                                                    <div style={{
                                                        position: 'absolute', inset: 0,
                                                        width: `${(dev.ticketCount / max) * 100}%`,
                                                        background: 'var(--envoy-red)',
                                                        borderRadius: 999,
                                                    }} />
                                                </div>
                                                <span style={{ fontWeight: 700, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' }}>
                                                    {dev.ticketCount} <span style={{ color: 'var(--fg-3)', fontWeight: 400, fontSize: 11 }}>tk</span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Activity heatmap */}
                    {heatmap && heatmap.rows.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <p className="eyebrow">Activity heatmap · trailing 12 weeks</p>
                            <p style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
                                Tickets created per week per top contributor.
                            </p>
                            <div style={{
                                marginTop: 12,
                                display: 'grid',
                                gridTemplateColumns: '110px 1fr',
                                rowGap: 6,
                                columnGap: 8,
                                alignItems: 'center',
                            }}>
                                {heatmap.rows.map((row) => (
                                    <DrawerHeatmapRow
                                        key={row.developerId}
                                        name={row.name}
                                        counts={row.counts}
                                        max={heatmap.max}
                                    />
                                ))}
                                <div />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fg-3)', marginTop: 2 }}>
                                    <span>{heatmap.weekLabels[0]}</span>
                                    <span>{heatmap.weekLabels[Math.floor(heatmap.weekLabels.length / 2)]}</span>
                                    <span>{heatmap.weekLabels[heatmap.weekLabels.length - 1]}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recent activity */}
                    <div style={{ marginBottom: 16 }}>
                        <p className="eyebrow">Recent activity</p>
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <ActivityLine icon={<GitCommit style={{ width: 14, height: 14, color: 'var(--fg-2)' }} />}
                                text={`${asset.ticketCount} tickets capitalized`} time="" />
                            <ActivityLine icon={<UserPlus style={{ width: 14, height: 14, color: 'var(--fg-2)' }} />}
                                text={`${ftesCount} FTEs allocated this period`} time="" />
                            <ActivityLine icon={<PlayCircle style={{ width: 14, height: 14, color: 'var(--fg-2)' }} />}
                                text={
                                    detail?.launchDate
                                        ? `In-service ${new Date(detail.launchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                        : detail?.startDate
                                            ? `Started ${new Date(detail.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                            : 'Launch date not set'
                                }
                                time=""
                            />
                            <ActivityLine icon={<Activity style={{ width: 14, height: 14, color: 'var(--fg-2)' }} />}
                                text={`${asset.usefulLifeMonths} month useful life · ${asset.monthsRemaining ?? 'n/a'} mo remaining`} time="" />
                        </div>
                    </div>

                    {/* Footer actions */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                        <Link
                            href={`/projects/${asset.id}`}
                            className="btn-primary"
                            style={{ flex: 1, justifyContent: 'center' }}
                            onClick={onClose}
                        >
                            <ExternalLink style={{ width: 14, height: 14 }} />
                            Open project
                        </Link>
                        <button
                            type="button"
                            className="btn-ghost"
                            style={{ flex: 1, justifyContent: 'center' }}
                            onClick={() => alert('Schedule export — wiring up next.')}
                        >
                            <Download style={{ width: 14, height: 14 }} />
                            Export schedule
                        </button>
                    </div>
                </div>
            </aside>

            <style jsx global>{`
                @keyframes asset-drawer-slide {
                    from { transform: translateX(20px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes asset-drawer-fade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    );
}

function DrawerStat({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div>
            <p className="eyebrow">{label}</p>
            <p style={{
                fontSize: 18, fontWeight: 700,
                color: color || 'var(--fg-1)',
                fontVariantNumeric: 'tabular-nums',
                marginTop: 2,
            }}>
                {value}
            </p>
        </div>
    );
}

function DrawerHeatmapRow({ name, counts, max }: { name: string; counts: number[]; max: number }) {
    return (
        <>
            <span style={{ fontSize: 12, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                {name}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${counts.length}, 1fr)`, gap: 3 }}>
                {counts.map((n, i) => {
                    const pct = max > 0 ? n / max : 0;
                    const bg = n === 0
                        ? 'var(--bg-surface-2)'
                        : `rgba(250, 67, 56, ${0.18 + pct * 0.72})`;
                    return (
                        <div
                            key={i}
                            title={n === 0 ? 'No tickets' : `${n} ticket${n === 1 ? '' : 's'}`}
                            style={{
                                aspectRatio: '1 / 1',
                                background: bg,
                                borderRadius: 3,
                                minHeight: 10,
                            }}
                        />
                    );
                })}
            </div>
        </>
    );
}

function ActivityLine({ icon, text, time }: { icon: React.ReactNode; text: string; time: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            {icon}
            <span style={{ flex: 1, color: 'var(--fg-1)' }}>{text}</span>
            {time && <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{time}</span>}
        </div>
    );
}
