'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FolderKanban, User, Ticket, Command, ArrowRight } from 'lucide-react';

interface SearchResult {
    type: 'project' | 'developer' | 'ticket';
    id: string;
    title: string;
    subtitle: string;
    href: string;
}

const TYPE_ICONS = {
    project: FolderKanban,
    developer: User,
    ticket: Ticket,
};

const TYPE_COLORS = {
    project: '#4141A2',
    developer: '#F5A623',
    ticket: '#21944E',
};

const TYPE_BG = {
    project: '#EEF2FF',
    developer: '#FFF4E6',
    ticket: '#EBF5EF',
};

export function GlobalSearch() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // ⌘K listener
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(prev => !prev);
            }
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setResults([]);
            setActiveIndex(0);
        }
    }, [open]);

    // Search on query change (debounced)
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!query || query.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        debounceRef.current = setTimeout(() => {
            fetch(`/api/search?q=${encodeURIComponent(query)}`)
                .then(r => r.json())
                .then(d => {
                    setResults(d.results || []);
                    setActiveIndex(0);
                    setLoading(false);
                })
                .catch(() => setLoading(false));
        }, 200);
    }, [query]);

    const navigate = useCallback((href: string) => {
        setOpen(false);
        router.push(href);
    }, [router]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[activeIndex]) {
            navigate(results[activeIndex].href);
        }
    };

    // Only render when open — no trigger button (triggered from sidebar)
    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={() => setOpen(false)}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.35)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9998,
                }}
            />
            {/* Modal */}
            <div style={{
                position: 'fixed',
                top: '18%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '100%',
                maxWidth: 560,
                background: '#fff',
                borderRadius: 16,
                boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)',
                zIndex: 9999,
                overflow: 'hidden',
            }}>
                {/* Input */}
                <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #E2E4E9' }}>
                    <Search className="w-5 h-5 flex-shrink-0" style={{ color: '#A4A9B6' }} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search projects, developers, tickets…"
                        style={{
                            flex: 1,
                            fontSize: 15,
                            fontWeight: 500,
                            color: '#3F4450',
                            outline: 'none',
                            border: 'none',
                            background: 'transparent',
                        }}
                    />
                    <kbd style={{
                        fontSize: 10,
                        padding: '2px 7px',
                        borderRadius: 5,
                        background: '#F0F0F5',
                        border: '1px solid #D0D3DC',
                        color: '#A4A9B6',
                        fontFamily: 'system-ui',
                        fontWeight: 700,
                    }}>ESC</kbd>
                </div>

                {/* Results */}
                <div style={{ maxHeight: 380, overflowY: 'auto', padding: '4px 0' }}>
                    {loading && (
                        <div className="flex items-center justify-center py-6">
                            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
                        </div>
                    )}

                    {!loading && query.length >= 2 && results.length === 0 && (
                        <div className="text-center py-8 px-6">
                            <Search className="w-8 h-8 mx-auto mb-2" style={{ color: '#D0D3DC' }} />
                            <p className="text-sm font-semibold" style={{ color: '#A4A9B6' }}>No results found</p>
                            <p className="text-xs mt-1" style={{ color: '#C8CAD0' }}>Try a different search term</p>
                        </div>
                    )}

                    {!loading && results.length > 0 && (
                        <div>
                            {/* Group by type */}
                            {(['project', 'developer', 'ticket'] as const).map(type => {
                                const group = results.filter(r => r.type === type);
                                if (group.length === 0) return null;
                                const Icon = TYPE_ICONS[type];
                                return (
                                    <div key={type}>
                                        <p className="text-[10px] font-bold uppercase tracking-widest px-5 py-2" style={{ color: TYPE_COLORS[type] }}>
                                            {type === 'project' ? 'Projects' : type === 'developer' ? 'Developers' : 'Tickets'}
                                        </p>
                                        {group.map((r) => {
                                            const idx = results.indexOf(r);
                                            const isActive = idx === activeIndex;
                                            return (
                                                <button
                                                    key={r.id}
                                                    onClick={() => navigate(r.href)}
                                                    onMouseEnter={() => setActiveIndex(idx)}
                                                    className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors"
                                                    style={{
                                                        background: isActive ? '#F6F6F9' : 'transparent',
                                                        cursor: 'pointer',
                                                        border: 'none',
                                                    }}
                                                >
                                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: TYPE_BG[r.type] }}>
                                                        <Icon className="w-3.5 h-3.5" style={{ color: TYPE_COLORS[r.type] }} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-semibold truncate" style={{ color: '#3F4450' }}>{r.title}</p>
                                                        <p className="text-[11px] truncate" style={{ color: '#A4A9B6' }}>{r.subtitle}</p>
                                                    </div>
                                                    {isActive && <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#A4A9B6' }} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!loading && query.length < 2 && (
                        <div className="text-center py-8 px-6">
                            <Command className="w-8 h-8 mx-auto mb-2" style={{ color: '#D0D3DC' }} />
                            <p className="text-sm font-semibold" style={{ color: '#A4A9B6' }}>Quick Search</p>
                            <p className="text-xs mt-1" style={{ color: '#C8CAD0' }}>Search by project name, developer name, or ticket ID</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-2.5 text-[10px] font-semibold" style={{ borderTop: '1px solid #E2E4E9', background: '#FAFBFC', color: '#A4A9B6' }}>
                    <span>↑↓ Navigate • Enter to select</span>
                    <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
                </div>
            </div>
        </>
    );
}
