'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import TipTapLink from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
    ArrowLeft, Printer, Bold, Italic, Underline as UnderlineIcon,
    AlignLeft, AlignCenter, AlignRight, List, ListOrdered,
    ChevronDown, Trash2, Check, Table as TableIcon, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import styles from './memo.module.css';

// ── Types ─────────────────────────────────────────────────────────────────
interface Memo {
    id: string;
    title: string;
    category: string;
    year: number;
    content: object;
    updatedAt: string;
}

const LIVE_TABLE_TYPES = [
    { type: 'PROJECT_SUMMARY',  label: 'Project Summary',      desc: 'All active projects — Cap. amount, depreciation, NAV' },
    { type: 'QRE_SUMMARY',     label: 'QRE Summary',          desc: 'Form 6765 QRE wages by developer' },
    { type: 'PAYROLL_SUMMARY', label: 'Payroll Summary',       desc: 'Payroll periods with wages, fringe, net cost' },
    { type: 'AMORT_SCHEDULE',  label: 'Amortization Schedule', desc: 'Monthly amortization charges by project' },
] as const;

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
    CAPITALIZATION:    { label: 'Capitalization Policy', color: '#4141A2' },
    RD_METHODOLOGY:    { label: 'R&D Methodology',       color: '#21944E' },
    ACCOUNTING_POLICY: { label: 'Accounting Policy',     color: '#D3A236' },
    CUSTOM:            { label: 'Custom',                 color: '#717684' },
};

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n || 0);
}
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }

// ── Live Table Block (rendered inline in read mode) ──────────────────────
function LiveTableBlock({ tableType, year }: { tableType: string; year: number }) {
    const [data, setData] = useState<{ columns: string[]; rows: unknown[]; summary?: Record<string, number> } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        fetch(`/api/memos/live-data?type=${tableType}&year=${year}`)
            .then(r => r.ok ? r.json() : Promise.reject(new Error('API error')))
            .then(d => { setData(d); setError(''); })
            .catch(() => setError('Failed to load'))
            .finally(() => setLoading(false));
    }, [tableType, year]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className={styles.liveTableLoading}><RefreshCw className="w-4 h-4 animate-spin" /></div>;
    if (error || !data) return <div className={styles.liveTableError}>Could not load data for this table.</div>;

    const formatCell = (col: string, val: unknown) => {
        if (typeof val === 'number') {
            if (col.toLowerCase().includes('%') || col === 'QRE %') return fmtPct(val);
            if (col.toLowerCase().includes('cost') || col.toLowerCase().includes('amount') || col.toLowerCase().includes('charge') ||
                col.toLowerCase().includes('wages') || col.toLowerCase().includes('qre') || col.toLowerCase().includes('nav') ||
                col.toLowerCase().includes('depreciation') || col.toLowerCase().includes('fringe') || col.toLowerCase().includes('loaded') ||
                col.toLowerCase().includes('adj') || col.toLowerCase().includes('sbc') || col.toLowerCase().includes('gross')) return fmt(val);
            return val.toString();
        }
        if (typeof val === 'boolean') return val ? '✓' : '—';
        return String(val ?? '—');
    };

    const rows = data.rows as Record<string, unknown>[];

    return (
        <div className={styles.liveTableBlock}>
            <div className={styles.liveTableHeader}>
                <span className={styles.liveTableBadge}>LIVE — {tableType.replace(/_/g, ' ')}</span>
                <button onClick={load} className={styles.liveTableRefresh} title="Refresh table">
                    <RefreshCw className="w-3 h-3" />
                </button>
            </div>
            <div className={styles.liveTableScrollArea}>
                <table className={styles.liveTable}>
                    <thead>
                        <tr>{data.columns.map(c => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i}>
                                {data.columns.map((col, j) => {
                                    const key = Object.keys(row)[j];
                                    return <td key={col}>{formatCell(col, row[key])}</td>;
                                })}
                            </tr>
                        ))}
                        {data.summary && (
                            <tr className={styles.summaryRow}>
                                <td><strong>Total QRE Wages</strong></td>
                                <td></td>
                                <td><strong>{fmt(data.summary.totalQREWages)}</strong></td>
                                <td></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── Toolbar Button ─────────────────────────────────────────────────────────
function ToolBtn({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={styles.toolBtn}
            style={{ background: active ? '#EDE9F7' : 'transparent', color: active ? '#4141A2' : '#3F4450' }}
        >
            {children}
        </button>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function MemoPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { data: session } = useSession();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    const [memo, setMemo] = useState<Memo | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState('');
    const [editTitle, setEditTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [showInsert, setShowInsert] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Load memo ────────────────────────────────────────────────────────
    useEffect(() => {
        fetch(`/api/memos/${id}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                setMemo(d?.memo ?? null);
                setTitleDraft(d?.memo?.title || '');
            })
            .finally(() => setLoading(false));
    }, [id]);

    // ── Editor ───────────────────────────────────────────────────────────
    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
            Underline,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Placeholder.configure({ placeholder: 'Start typing your memo…' }),
            TipTapLink.configure({ openOnClick: true, autolink: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
            Table.configure({ resizable: false }),
            TableRow,
            TableCell,
            TableHeader,
        ],
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        editable: isAdmin,
        immediatelyRender: false,
        onUpdate({ editor }) {
            if (!isAdmin) return;
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => saveContent(editor.getJSON()), 1500);
        },
    });

    // ── Set content once memo loads ───────────────────────────────────────
    useEffect(() => {
        if (editor && memo?.content) {
            try {
                editor.commands.setContent(memo.content as any);
            } catch (err) {
                console.error('[MemoPage] setContent failed:', err);
                editor.commands.setContent({
                    type: 'doc',
                    content: [
                        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '⚠️ Content failed to render' }] },
                        { type: 'paragraph', content: [{ type: 'text', text: 'The stored memo contains unsupported formatting. Please regenerate this memo using the LLM button.' }] },
                    ],
                });
            }
        }
    }, [editor, memo?.id]); // eslint-disable-line

    // ── Save helpers ─────────────────────────────────────────────────────
    const saveContent = useCallback(async (content: object) => {
        setSaving(true);
        await fetch(`/api/memos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });
        setSaving(false);
        setSavedAt(new Date().toLocaleTimeString());
    }, [id]);

    const saveTitle = async () => {
        if (!titleDraft.trim()) return;
        await fetch(`/api/memos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: titleDraft }),
        });
        setMemo(m => m ? { ...m, title: titleDraft } : m);
        setEditTitle(false);
    };

    const deleteMemo = async () => {
        await fetch(`/api/memos/${id}`, { method: 'DELETE' });
        router.push('/memos');
    };

    // ── Insert live table as a blockquote-wrapped placeholder ────────────
    const insertLiveTable = (tableType: string) => {
        if (!editor) return;
        setShowInsert(false);
        // We store as a special blockquote with data prefix for serialization
        editor.chain().focus().insertContent({
            type: 'blockquote',
            attrs: {},
            content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: `[LIVE_TABLE:${tableType}:${memo?.year || new Date().getFullYear()}]` }],
            }],
        }).run();
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveContent(editor.getJSON()), 1000);
    };

    // ── Render the EditorContent with live table substitution ─────────────
    const renderContent = () => {
        if (!editor) return null;
        const json = editor.getJSON();
        const content = json.content || [];

        // We pass directly to EditorContent for editing mode
        // For view mode overlay, parse blockquotes with LIVE_TABLE markers
        return null;
    };

    renderContent(); // silence unused warning

    if (loading) {
        return (
            <div className="flex items-center justify-center h-60">
                <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#4141A2', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    if (!memo) return <div className={styles.notFound}>Memo not found.</div>;

    const cat = CATEGORY_LABELS[memo.category] || CATEGORY_LABELS.CUSTOM;

    return (
        <div className={styles.wrapper}>
            {/* ─── Toolbar ─── (hidden on print) */}
            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    <Link href="/memos" className={styles.backLink}>
                        <ArrowLeft className="w-3.5 h-3.5" /> All Memos
                    </Link>
                    <div className={styles.sep} />

                    {isAdmin && editor && (
                        <>
                            {/* Heading select */}
                            <select
                                className={styles.headingSelect}
                                value={
                                    editor.isActive('heading', { level: 1 }) ? '1' :
                                    editor.isActive('heading', { level: 2 }) ? '2' :
                                    editor.isActive('heading', { level: 3 }) ? '3' : '0'
                                }
                                onChange={e => {
                                    const v = parseInt(e.target.value);
                                    if (v === 0) editor.chain().focus().setParagraph().run();
                                    else editor.chain().focus().toggleHeading({ level: v as 1 | 2 | 3 }).run();
                                }}
                            >
                                <option value="0">Paragraph</option>
                                <option value="1">Heading 1</option>
                                <option value="2">Heading 2</option>
                                <option value="3">Heading 3</option>
                            </select>

                            <div className={styles.sep} />

                            <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
                                <Bold className="w-3.5 h-3.5" />
                            </ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
                                <Italic className="w-3.5 h-3.5" />
                            </ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
                                <UnderlineIcon className="w-3.5 h-3.5" />
                            </ToolBtn>

                            <div className={styles.sep} />

                            <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
                                <AlignLeft className="w-3.5 h-3.5" />
                            </ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Center">
                                <AlignCenter className="w-3.5 h-3.5" />
                            </ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
                                <AlignRight className="w-3.5 h-3.5" />
                            </ToolBtn>

                            <div className={styles.sep} />

                            <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
                                <List className="w-3.5 h-3.5" />
                            </ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
                                <ListOrdered className="w-3.5 h-3.5" />
                            </ToolBtn>

                            <div className={styles.sep} />

                            {/* Insert Table */}
                            <ToolBtn
                                onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                                active={false}
                                title="Insert custom table"
                            >
                                <TableIcon className="w-3.5 h-3.5" />
                            </ToolBtn>

                            {/* Insert Live Table */}
                            <div className={styles.insertDropdown}>
                                <button
                                    className={styles.insertBtn}
                                    onClick={() => setShowInsert(v => !v)}
                                >
                                    Insert Live Table <ChevronDown className="w-3 h-3" />
                                </button>
                                {showInsert && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowInsert(false)} />
                                        <div className={styles.insertMenu}>
                                            {LIVE_TABLE_TYPES.map(t => (
                                                <button key={t.type} className={styles.insertItem} onClick={() => insertLiveTable(t.type)}>
                                                    <span className={styles.insertItemLabel}>{t.label}</span>
                                                    <span className={styles.insertItemDesc}>{t.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className={styles.toolbarRight}>
                    {isAdmin && (
                        <span className={styles.saveStatus}>
                            {saving ? 'Saving…' : savedAt ? `Saved ${savedAt}` : 'Auto-save on'}
                        </span>
                    )}
                    {isAdmin && (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className={styles.deleteBtn}
                            title="Delete memo"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button onClick={() => window.print()} className={styles.printBtn}>
                        <Printer className="w-4 h-4" /> Print / PDF
                    </button>
                </div>
            </div>

            {/* Delete confirm */}
            {showDeleteConfirm && (
                <div className={styles.deleteOverlay}>
                    <div className={styles.deleteDialog}>
                        <h3 className={styles.deleteTitle}>Delete this memo?</h3>
                        <p className={styles.deleteBody}>This action cannot be undone. The document and all its content will be permanently deleted.</p>
                        <div className={styles.deleteBtns}>
                            <button onClick={() => setShowDeleteConfirm(false)} className={styles.cancelBtn}>Cancel</button>
                            <button onClick={deleteMemo} className={styles.confirmDelBtn}>Yes, delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Memo Body ─── */}
            <div className={styles.page}>
                {/* Memo header (printed) */}
                <div className={styles.memoHeader}>
                    <div className={styles.memoMeta}>
                        <span className={styles.categoryPill} style={{ color: cat.color, borderColor: cat.color }}>
                            {cat.label}
                        </span>
                        <span className={styles.memoYear}>FY {memo.year}</span>
                    </div>

                    {/* Editable title */}
                    {isAdmin && editTitle ? (
                        <div className={styles.titleEditRow}>
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={e => setTitleDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(false); }}
                                className={styles.titleInput}
                            />
                            <button onClick={saveTitle} className={styles.titleSaveBtn} title="Save title"><Check className="w-4 h-4" /></button>
                        </div>
                    ) : (
                        <h1
                            className={styles.memoTitle}
                            onClick={() => { if (isAdmin) setEditTitle(true); }}
                            title={isAdmin ? 'Click to edit title' : ''}
                            style={{ cursor: isAdmin ? 'text' : 'default' }}
                        >
                            {memo.title}
                        </h1>
                    )}

                    <div className={styles.metaRow}>
                        <span>No Cap — ASC 350-40 Compliance System</span>
                        <span>·</span>
                        <span>Last updated: {new Date(memo.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                    <hr className={styles.divider} />
                </div>

                {/* Editor */}
                <div className={styles.editorWrapper}>
                    <EditorContent editor={editor} className={styles.editorContent} />
                </div>

                {/* Live table renderer — reads blockquotes with LIVE_TABLE markers */}
                <LiveTableRenderer editor={editor} memoYear={memo.year} />
            </div>
        </div>
    );
}

// ── Live Table Renderer overlay ────────────────────────────────────────────
// Scans editor JSON for blockquotes with LIVE_TABLE markers and renders them
function LiveTableRenderer({ editor, memoYear }: { editor: ReturnType<typeof useEditor> | null; memoYear: number }) {
    const [tables, setTables] = useState<{ key: string; type: string; year: number }[]>([]);

    useEffect(() => {
        if (!editor) return;
        const scanEditor = () => {
            const json = editor.getJSON();
            const found: { key: string; type: string; year: number }[] = [];
            function scan(node: any, idx: number) {
                if (node.type === 'blockquote') {
                    const text = node.content?.[0]?.content?.[0]?.text || '';
                    const match = text.match(/^\[LIVE_TABLE:([^:]+):(\d+)\]$/);
                    if (match) found.push({ key: `${idx}-${match[1]}-${match[2]}`, type: match[1], year: parseInt(match[2]) });
                }
                (node.content || []).forEach((child: any, i: number) => scan(child, idx * 100 + i));
            }
            (json.content || []).forEach((node: any, i) => scan(node, i));
            setTables(found);
        };
        scanEditor();
        editor.on('update', scanEditor);
        return () => { editor.off('update', scanEditor); };
    }, [editor]);

    if (tables.length === 0) return null;

    return (
        <div className={styles.liveTablesSection}>
            {tables.map(t => (
                <div key={t.key} className={styles.liveTableContainer}>
                    <p className={styles.liveTableTitle}>{LIVE_TABLE_TYPES.find(lt => lt.type === t.type)?.label} — FY {t.year}</p>
                    <LiveTableBlock tableType={t.type} year={t.year} />
                </div>
            ))}
        </div>
    );
}
