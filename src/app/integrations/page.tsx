'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Upload, CheckCircle, Github, ListFilter, Plus, Trash2, ArrowUp, ArrowDown, GripVertical, RotateCcw, Unlink, Link as LinkIcon, Users, AlertCircle, Eye, EyeOff, Zap, X as XIcon, Settings, WifiOff, Wifi, ArrowLeft } from 'lucide-react';

interface CapRule {
    priority: number;
    issueType: string;
    projectStatus: string;
    projectCapitalizable: boolean | null;
    action: string;
}

const ISSUE_TYPES = ['STORY', 'BUG', 'TASK', 'EPIC', 'SUBTASK', 'ANY'];
const PROJECT_STATUSES = ['PLANNING', 'DEV', 'LIVE', 'RETIRED', 'ANY'];
const CAP_OPTIONS = [
    { value: 'true', label: 'Yes (capitalizable only)' },
    { value: 'false', label: 'No (non-capitalizable only)' },
    { value: 'null', label: 'Any' },
];

function actionBadge(action: string) {
    if (action === 'CAPITALIZE') return { bg: '#EBF5EF', color: '#21944E' };
    if (action === 'EXPENSE') return { bg: '#FFF5F5', color: '#FA4338' };
    return { bg: '#F6F6F9', color: '#717684' };
}

export default function IntegrationsPage() {
    // ── Jira Config state ──────────────────────────────────────────────────────
    const [jiraConfigLoading, setJiraConfigLoading] = useState(true);
    const [jiraIsConfigured, setJiraIsConfigured] = useState(false);
    const [jiraHost, setJiraHost] = useState('');
    const [jiraEmail, setJiraEmail] = useState('');
    const [jiraToken, setJiraToken] = useState('');
    const [jiraTokenMasked, setJiraTokenMasked] = useState(true); // true = show ••••
    const [jiraShowToken, setJiraShowToken] = useState(false);
    const [jiraProjectKeys, setJiraProjectKeys] = useState(''); // comma-separated string
    const [jiraProjectKeyInput, setJiraProjectKeyInput] = useState(''); // tag input
    const [jiraSyncDays, setJiraSyncDays] = useState('90');
    const [jiraCustomFields, setJiraCustomFields] = useState<{ id: string; name: string }[]>([]);
    const [jiraConfigSaving, setJiraConfigSaving] = useState(false);
    const [jiraConfigSaved, setJiraConfigSaved] = useState(false);
    const [jiraConfigError, setJiraConfigError] = useState<string | null>(null);
    const [jiraConfigExpanded, setJiraConfigExpanded] = useState(false);
    
    // Dynamic Fields state
    const [availableJiraFields, setAvailableJiraFields] = useState<{ id: string; name: string }[]>([]);
    const [fieldsLoading, setFieldsLoading] = useState(false);
    const [fieldsSearchQuery, setFieldsSearchQuery] = useState('');

    // ── Jira Test Connection state ─────────────────────────────────────────────
    const [jiraTesting, setJiraTesting] = useState(false);
    const [jiraTestResult, setJiraTestResult] = useState<{ ok: boolean; message: string } | null>(null);

    // ── Jira Sync state ────────────────────────────────────────────────────────
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [lastSync, setLastSync] = useState<string | null>(null);

    // ── Jira User ID Sync state ──────────────────────────────────────────────
    const [jiraIdSyncing, setJiraIdSyncing] = useState(false);
    const [jiraIdSyncResult, setJiraIdSyncResult] = useState<string | null>(null);

    // ── Payroll upload state ────────────────────────────────────────────────────
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Classification rules state
    const [rules, setRules] = useState<CapRule[]>([]);
    const [rulesLoading, setRulesLoading] = useState(true);
    const [rulesSaving, setRulesSaving] = useState(false);
    const [rulesSaved, setRulesSaved] = useState(false);
    const [newRule, setNewRule] = useState<CapRule>({
        priority: 99, issueType: 'STORY', projectStatus: 'DEV',
        projectCapitalizable: true, action: 'CAPITALIZE',
    });

    // GitHub integration state
    const [ghRepos, setGhRepos] = useState<{ id: string; owner: string; name: string; projectId: string | null; isActive: boolean }[]>([]);
    const [ghProjects, setGhProjects] = useState<{ id: string; name: string; epicKey: string; status: string }[]>([]);
    const [ghNewRepo, setGhNewRepo] = useState('');
    const [ghSyncing, setGhSyncing] = useState(false);
    const [ghSyncResult, setGhSyncResult] = useState<string | null>(null);
    const [ghLastSync, setGhLastSync] = useState<string | null>(null);
    const [ghEvents, setGhEvents] = useState<{ id: string; title: string; author: string; repoOwner: string; repoName: string; classification: string | null; mergedAt: string | null; url: string | null }[]>([]);
    const [ghFilter, setGhFilter] = useState('ALL');

    // Roster Sync state
    const [bambooSubdomain, setBambooSubdomain] = useState('');
    const [bambooKey, setBambooKey] = useState('');
    const [bambooPreview, setBambooPreview] = useState<{ name: string; email: string; role: string; jobTitle: string; alreadyExists: boolean; selected?: boolean }[]>([]);
    const [bambooPreviewing, setBambooPreviewing] = useState(false);
    const [bambooImporting, setBambooImporting] = useState(false);
    const [bambooResult, setBambooResult] = useState<string | null>(null);
    const [bambooError, setBambooError] = useState<string | null>(null);
    const [rosterDragging, setRosterDragging] = useState(false);
    const rosterFileRef = useRef<HTMLInputElement>(null);
    const [rosterPreview, setRosterPreview] = useState<{ name: string; email: string; role: string; monthlySalary: number; alreadyExists: boolean }[]>([]);
    const [rosterPreviewing, setRosterPreviewing] = useState(false);
    const [rosterImporting, setRosterImporting] = useState(false);
    const [rosterResult, setRosterResult] = useState<string | null>(null);
    const [rosterError, setRosterError] = useState<string | null>(null);

    useEffect(() => {
        // Load Jira config
        fetch('/api/integrations/jira-config')
            .then((r) => r.json())
            .then((d) => {
                if (d.config) {
                    setJiraHost(d.config.jira_host || '');
                    setJiraEmail(d.config.jira_user_email || '');
                    setJiraToken(d.config.jira_api_token || ''); // will be '••••••••' if set
                    setJiraTokenMasked(!!d.config.jira_api_token);
                    setJiraProjectKeys(d.config.jira_project_keys || '');
                    setJiraSyncDays(d.config.jira_sync_days || '90');
                    try { 
                        const parsed = JSON.parse(d.config.jira_custom_fields || '[]'); 
                        if (parsed.length > 0 && typeof parsed[0] === 'string') {
                            setJiraCustomFields(parsed.map((id: string) => ({ id, name: id })));
                        } else {
                            setJiraCustomFields(parsed);
                        }
                    } catch { setJiraCustomFields([]); }
                    setJiraIsConfigured(d.isConfigured);
                    setJiraConfigExpanded(!d.isConfigured); // auto-open config if not set
                }
            })
            .catch(() => {})
            .finally(() => setJiraConfigLoading(false));

        // Load last sync time
        fetch('/api/integrations/jira-sync', { method: 'GET' })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => d?.lastSync && setLastSync(d.lastSync))
            .catch(() => {});

        fetch('/api/rules')
            .then((r) => r.json())
            .then((data) => { setRules(Array.isArray(data) ? data : []); })
            .finally(() => setRulesLoading(false));

        fetch('/api/integrations/github/repos')
            .then((r) => r.json())
            .then((d) => { setGhRepos(d.repos || []); setGhProjects(d.projects || []); })
            .catch(() => {});

        fetch('/api/integrations/github/events?page=1')
            .then((r) => r.json())
            .then((d) => setGhEvents(d.events || []))
            .catch(() => {});

        fetch('/api/integrations/github/sync')
            .then((r) => r.json())
            .then((d) => setGhLastSync(d.lastSync || null))
            .catch(() => {});
    }, []);

    // ── Jira Handlers ─────────────────────────────────────────────────────────
    const saveJiraConfig = async () => {
        setJiraConfigSaving(true);
        setJiraConfigError(null);
        setJiraConfigSaved(false);
        try {
            const body: Record<string, string> = {
                jira_host: jiraHost,
                jira_user_email: jiraEmail,
                jira_project_keys: jiraProjectKeys,
                jira_sync_days: jiraSyncDays,
                jira_custom_fields: JSON.stringify(jiraCustomFields),
            };
            // Only send token if it's not the masked placeholder
            if (jiraToken && jiraToken !== '••••••••') body.jira_api_token = jiraToken;
            const res = await fetch('/api/integrations/jira-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) { setJiraConfigError(data.error || 'Save failed'); return; }
            setJiraIsConfigured(true);
            setJiraConfigSaved(true);
            setJiraTokenMasked(true);
            setJiraToken('••••••••');
            setTimeout(() => setJiraConfigSaved(false), 3000);
        } catch (err) {
            setJiraConfigError('Failed to save configuration');
        } finally {
            setJiraConfigSaving(false);
        }
    };

    const testJiraConnection = async () => {
        // Save first so the test uses up-to-date credentials
        if (!jiraTokenMasked && jiraToken && jiraToken !== '••••••••') {
            await saveJiraConfig();
        }
        setJiraTesting(true);
        setJiraTestResult(null);
        try {
            const res = await fetch('/api/integrations/jira-config?action=test', { method: 'POST' });
            const data = await res.json();
            setJiraTestResult({ ok: data.ok, message: data.message });
        } catch {
            setJiraTestResult({ ok: false, message: 'Connection test failed — network error' });
        } finally {
            setJiraTesting(false);
        }
    };

    const loadJiraFields = async () => {
        setFieldsLoading(true);
        try {
            const res = await fetch('/api/integrations/jira-config?action=fields', { method: 'POST' });
            const data = await res.json();
            if (data.ok && data.fields) {
                // sort them alphabetically
                const sorted = data.fields.sort((a: any, b: any) => a.name.localeCompare(b.name));
                setAvailableJiraFields(sorted);
                
                // Auto-remap backward compatible states to their real names
                setJiraCustomFields(prev => prev.map(f => {
                    const realField = sorted.find((s: any) => s.id === f.id);
                    return realField ? { id: f.id, name: realField.name } : f;
                }));
            }
        } catch (err) {
            console.error('Failed to load fields', err);
        } finally {
            setFieldsLoading(false);
        }
    };

    const handleJiraSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        setSyncError(null);
        try {
            const res = await fetch('/api/integrations/jira-sync', { method: 'POST' });
            const data = await res.json();
            if (!res.ok || data.configRequired) {
                setSyncError(data.error || 'Sync failed');
            } else {
                setSyncResult(data.message);
                setLastSync(new Date().toISOString());
            }
        } catch {
            setSyncError('Sync failed — network error');
        } finally {
            setSyncing(false);
        }
    };

    const addProjectKey = () => {
        const key = jiraProjectKeyInput.trim().toUpperCase();
        if (!key) return;
        const existing = jiraProjectKeys ? jiraProjectKeys.split(',').map((k) => k.trim()).filter(Boolean) : [];
        if (!existing.includes(key)) {
            setJiraProjectKeys([...existing, key].join(','));
        }
        setJiraProjectKeyInput('');
    };

    const removeProjectKey = (key: string) => {
        const updated = jiraProjectKeys.split(',').map((k) => k.trim()).filter((k) => k && k !== key);
        setJiraProjectKeys(updated.join(','));
    };

    // ── Payroll CSV ───────────────────────────────────────────────────────────
    const processCsv = async (text: string) => {
        setUploading(true);
        setUploadResult(null);
        try {
            const lines = text.trim().split('\n');
            const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
            const data = lines.slice(1).map((line) => {
                const values = line.split(',').map((v) => v.trim());
                const row: Record<string, string> = {};
                headers.forEach((h, i) => { row[h] = values[i] || ''; });
                return row;
            });
            const res = await fetch('/api/integrations/payroll-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data }),
            });
            const result = await res.json();
            setUploadResult(`✓ ${result.message}`);
        } catch {
            setUploadResult('✗ Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleFileUpload = async (file: File) => {
        const text = await file.text();
        await processCsv(text);
    };

    const onDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) await handleFileUpload(file);
    }, []); // eslint-disable-line

    // ── Rules ─────────────────────────────────────────────────────────────────
    const saveRules = async () => {
        setRulesSaving(true);
        setRulesSaved(false);
        try {
            const ranked = rules.map((r, i) => ({ ...r, priority: i + 1 }));
            await fetch('/api/rules', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ranked),
            });
            setRules(ranked);
            setRulesSaved(true);
            setTimeout(() => setRulesSaved(false), 2000);
        } finally {
            setRulesSaving(false);
        }
    };

    const resetRules = async () => {
        setRulesLoading(true);
        const data = await fetch('/api/rules', { method: 'DELETE' }).then((r) => r.json());
        setRules(Array.isArray(data) ? data : []);
        setRulesLoading(false);
    };

    const addRule = () => {
        const updated = [...rules, { ...newRule, priority: rules.length + 1 }];
        setRules(updated);
    };

    const removeRule = (index: number) => {
        setRules(rules.filter((_, i) => i !== index));
    };

    const moveRule = (index: number, dir: -1 | 1) => {
        const next = [...rules];
        const target = index + dir;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setRules(next);
    };

    // ── GitHub ────────────────────────────────────────────────────────────────
    const loadGhEvents = async (filter: string) => {
        const url = filter === 'ALL' ? '/api/integrations/github/events' : `/api/integrations/github/events?classification=${filter}`;
        const d = await fetch(url).then((r) => r.json());
        setGhEvents(d.events || []);
    };

    const addGhRepo = async () => {
        const parts = ghNewRepo.trim().split('/');
        if (parts.length !== 2) return;
        const [owner, name] = parts;
        await fetch('/api/integrations/github/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner, name }),
        });
        setGhNewRepo('');
        const d = await fetch('/api/integrations/github/repos').then((r) => r.json());
        setGhRepos(d.repos || []);
    };

    const removeGhRepo = async (id: string) => {
        await fetch('/api/integrations/github/repos', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        setGhRepos((prev) => prev.filter((r) => r.id !== id));
    };

    const mapGhRepo = async (id: string, projectId: string) => {
        await fetch('/api/integrations/github/repos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, projectId: projectId || null }),
        });
        setGhRepos((prev) => prev.map((r) => r.id === id ? { ...r, projectId: projectId || null } : r));
    };

    const syncGitHub = async () => {
        setGhSyncing(true);
        setGhSyncResult(null);
        try {
            const r = await fetch('/api/integrations/github/sync', { method: 'POST' });
            const d = await r.json();
            if (d.error) { setGhSyncResult(`✗ ${d.error}`); }
            else {
                setGhSyncResult(`✓ Synced ${d.synced} PRs across ${d.repos} repos`);
                setGhLastSync(new Date().toISOString());
                await loadGhEvents(ghFilter);
            }
        } catch { setGhSyncResult('✗ Sync failed'); }
        finally { setGhSyncing(false); }
    };

    // ── Roster Sync ───────────────────────────────────────────────────────────
    const previewBamboo = async () => {
        setBambooPreviewing(true);
        setBambooError(null);
        try {
            const r = await fetch('/api/integrations/bamboohr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subdomain: bambooSubdomain, apiKey: bambooKey, action: 'preview' }),
            });
            const d = await r.json();
            if (!r.ok) { setBambooError(d.error); return; }
            setBambooPreview(d.preview.map((e: { name: string; email: string; role: string; jobTitle: string; alreadyExists: boolean }) => ({ ...e, selected: !e.alreadyExists })));
        } finally { setBambooPreviewing(false); }
    };

    const importBamboo = async () => {
        setBambooImporting(true);
        setBambooResult(null);
        const selected = bambooPreview.filter((e) => e.selected);
        const r = await fetch('/api/integrations/bamboohr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subdomain: bambooSubdomain, apiKey: bambooKey, action: 'import', rows: selected }),
        });
        const d = await r.json();
        setBambooResult(`✓ Imported ${d.imported}, skipped ${d.skipped} duplicates${d.errors?.length ? `, ${d.errors.length} errors` : ''}`);
        setBambooPreview([]);
        setBambooImporting(false);
    };

    const handleRosterFile = async (file: File) => {
        setRosterPreviewing(true);
        setRosterError(null);
        setRosterPreview([]);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('action', 'preview');
        const r = await fetch('/api/integrations/roster-csv', { method: 'POST', body: fd });
        const d = await r.json();
        if (!r.ok) { setRosterError(d.error); setRosterPreviewing(false); return; }
        setRosterPreview(d.preview || []);
        setRosterPreviewing(false);
    };

    const importRoster = async () => {
        setRosterImporting(true);
        setRosterResult(null);
        const fd = new FormData();
        fd.append('action', 'import');
        fd.append('rows', JSON.stringify(rosterPreview));
        const r = await fetch('/api/integrations/roster-csv', { method: 'POST', body: fd });
        const d = await r.json();
        setRosterResult(`✓ Imported ${d.imported}, skipped ${d.skipped} duplicates${d.errors?.length ? `, ${d.errors.length} errors` : ''}`);
        setRosterPreview([]);
        setRosterImporting(false);
    };

    return (
        <div>
            <div className="mb-4">
                <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Admin Portal
                </Link>
            </div>
            <div className="mb-8">
                <h1 className="section-header">Integrations</h1>
                <p className="section-subtext">Data ingestion from Jira, payroll systems, GitHub, and classification rules</p>
            </div>

            {/* Top row: Jira + Payroll */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Jira Integration */}
                <div className="glass-card p-6" style={{ gridColumn: 'span 2' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8F4F8' }}>
                                <Zap className="w-5 h-5" style={{ color: '#4141A2' }} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Jira Integration</h2>
                                    {!jiraConfigLoading && (
                                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{
                                            background: jiraIsConfigured ? '#EBF5EF' : '#FFF5F5',
                                            color: jiraIsConfigured ? '#21944E' : '#FA4338',
                                        }}>
                                            {jiraIsConfigured ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                                            {jiraIsConfigured ? 'Connected' : 'Not Configured'}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs" style={{ color: '#A4A9B6' }}>Import resolved tickets from Jira to drive capitalization calculations</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setJiraConfigExpanded((e) => !e)}
                            className="btn-ghost flex items-center gap-1.5 text-xs"
                        >
                            <Settings className="w-3.5 h-3.5" />
                            {jiraConfigExpanded ? 'Hide Config' : 'Configure'}
                        </button>
                    </div>

                    {/* Config panel */}
                    {jiraConfigExpanded && (
                        <div className="rounded-xl p-5 mb-5" style={{ background: '#F6F6F9', border: '1px solid #E2E4E9' }}>
                            <h3 className="text-xs font-semibold mb-4" style={{ color: '#3F4450', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Jira Configuration
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                {/* Host */}
                                <div>
                                    <label className="form-label">Jira Host URL</label>
                                    <input
                                        type="url"
                                        className="form-input"
                                        placeholder="https://yourcompany.atlassian.net"
                                        value={jiraHost}
                                        onChange={(e) => setJiraHost(e.target.value)}
                                    />
                                    <p className="text-[10px] mt-1" style={{ color: '#A4A9B6' }}>Your Atlassian domain (no trailing slash)</p>
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="form-label">Account Email</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        placeholder="admin@yourcompany.com"
                                        value={jiraEmail}
                                        onChange={(e) => setJiraEmail(e.target.value)}
                                    />
                                    <p className="text-[10px] mt-1" style={{ color: '#A4A9B6' }}>The email linked to your Jira API token</p>
                                </div>

                                {/* API Token */}
                                <div>
                                    <label className="form-label">API Token</label>
                                    <div className="relative">
                                        <input
                                            type={jiraShowToken ? 'text' : 'password'}
                                            className="form-input"
                                            style={{ paddingRight: 38 }}
                                            placeholder="ATATT3xFfGF..."
                                            value={jiraToken}
                                            onChange={(e) => {
                                                setJiraToken(e.target.value);
                                                setJiraTokenMasked(false);
                                            }}
                                            onFocus={() => {
                                                // Clear the mask so user can type new token
                                                if (jiraTokenMasked) { setJiraToken(''); setJiraTokenMasked(false); }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setJiraShowToken((s) => !s)}
                                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#A4A9B6' }}
                                        >
                                            {jiraShowToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-[10px] mt-1" style={{ color: '#A4A9B6' }}>
                                        Generate at{' '}
                                        <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: '#4141A2' }}>
                                            id.atlassian.com → API tokens
                                        </a>
                                    </p>
                                </div>

                                {/* Sync Window */}
                                <div>
                                    <label className="form-label">Sync Window</label>
                                    <select className="form-select" value={jiraSyncDays} onChange={(e) => setJiraSyncDays(e.target.value)}>
                                        <option value="30">Last 30 days</option>
                                        <option value="60">Last 60 days</option>
                                        <option value="90">Last 90 days</option>
                                        <option value="180">Last 180 days</option>
                                        <option value="365">Last 365 days</option>
                                    </select>
                                    <p className="text-[10px] mt-1" style={{ color: '#A4A9B6' }}>How far back to pull resolved tickets on each sync</p>
                                </div>
                            </div>

                            {/* Project Keys */}
                            <div className="mb-4">
                                <label className="form-label">Project Keys</label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {jiraProjectKeys
                                        .split(',')
                                        .map((k) => k.trim())
                                        .filter(Boolean)
                                        .map((key) => (
                                            <span
                                                key={key}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    background: '#EEF2FF', color: '#4141A2',
                                                    fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
                                                    padding: '3px 10px', borderRadius: 6,
                                                }}
                                            >
                                                {key}
                                                <button
                                                    type="button"
                                                    onClick={() => removeProjectKey(key)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4141A2', display: 'flex', alignItems: 'center', padding: 0 }}
                                                >
                                                    <XIcon className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    {jiraProjectKeys.split(',').filter((k) => k.trim()).length === 0 && (
                                        <span style={{ fontSize: 12, color: '#A4A9B6' }}>No project keys added yet</span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="e.g. ENG, MOBILE, CORE"
                                        value={jiraProjectKeyInput}
                                        onChange={(e) => setJiraProjectKeyInput(e.target.value.toUpperCase())}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addProjectKey(); } }}
                                        style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                                    />
                                    <button type="button" onClick={addProjectKey} className="btn-ghost" style={{ flexShrink: 0 }}>
                                        <Plus className="w-4 h-4" /> Add
                                    </button>
                                </div>
                                <p className="text-[10px] mt-1" style={{ color: '#A4A9B6' }}>
                                    These must match your Jira project keys exactly. Tickets are matched to local projects by epic key prefix (e.g. <span style={{ fontFamily: 'monospace' }}>ENG-123</span> → project with epic key <span style={{ fontFamily: 'monospace' }}>ENG</span>).
                                </p>
                            </div>

                            {/* Additional Columns Checkout */}
                            <div className="mb-4">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="form-label" style={{ margin: 0 }}>Additional Columns to Import</label>
                                    {jiraIsConfigured && (
                                        <button 
                                            type="button" 
                                            onClick={loadJiraFields} 
                                            disabled={fieldsLoading} 
                                            className="text-[10px] font-semibold hover:underline flex items-center gap-1"
                                            style={{ color: '#4141A2' }}
                                        >
                                            {fieldsLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            {fieldsLoading ? 'Loading...' : availableJiraFields.length > 0 ? 'Reload Fields' : 'Load Available Fields'}
                                        </button>
                                    )}
                                </div>
                                
                                {availableJiraFields.length > 0 && (
                                    <input 
                                       type="search" 
                                       placeholder="Search fields..." 
                                       className="form-input mb-2 text-xs py-1.5"
                                       value={fieldsSearchQuery}
                                       onChange={(e) => setFieldsSearchQuery(e.target.value)} 
                                    />
                                )}

                                <div className="flex flex-wrap content-start gap-y-2 gap-x-4 mt-1.5 p-3 rounded-lg border max-h-48 overflow-y-auto" style={{ borderColor: '#E2E4E9', background: '#FFFFFF' }}>
                                    {availableJiraFields.length === 0 ? (
                                        <p className="text-[11px] text-center w-full py-3" style={{ color: '#A4A9B6' }}>
                                            {jiraIsConfigured 
                                                ? "Click 'Load Available Fields' to retrieve columns from your Jira instance."
                                                : "Configure your Jira host, email, and API token first to load fields."}
                                        </p>
                                    ) : (
                                        availableJiraFields
                                            .filter(f => f.name.toLowerCase().includes(fieldsSearchQuery.toLowerCase()))
                                            .map(field => (
                                                <label key={field.id} className="flex items-center gap-1.5 text-xs select-none" style={{ color: '#3F4450', cursor: 'pointer', width: '46%' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        style={{ width: 14, height: 14, accentColor: '#4141A2', flexShrink: 0 }}
                                                        checked={jiraCustomFields.some(f => f.id === field.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setJiraCustomFields(prev => [...prev, { id: field.id, name: field.name }]);
                                                            else setJiraCustomFields(prev => prev.filter(f => f.id !== field.id));
                                                        }}
                                                    />
                                                    <span style={{ paddingTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={field.name}>
                                                        {field.name}
                                                    </span>
                                                </label>
                                            ))
                                    )}
                                </div>
                                <p className="text-[10px] mt-1.5 leading-snug" style={{ color: '#A4A9B6' }}>
                                    Select any extra fields you want to pull directly from Jira. These will automatically appear as columns on your project's ticket list and period imports.
                                </p>

                                {jiraCustomFields.length > 0 && (
                                    <div className="mt-4">
                                        <label className="form-label" style={{ margin: 0 }}>Selected Columns Arrangement</label>
                                        <p className="text-[10px] mb-2" style={{ color: '#A4A9B6' }}>Rearrange these fields to dictate the column order within the Import and Detail tables.</p>
                                        <div className="flex flex-col gap-1.5 p-2 rounded-lg border" style={{ borderColor: '#E2E4E9', background: '#F8F9FA' }}>
                                            {jiraCustomFields.map((field, idx) => (
                                                <div key={field.id} className="flex items-center justify-between p-2 rounded bg-white shadow-sm border" style={{ borderColor: '#E2E4E9' }}>
                                                    <div className="flex items-center gap-2">
                                                        <GripVertical className="w-3.5 h-3.5" style={{ color: '#C4C9D6' }} />
                                                        <span className="text-xs font-semibold" style={{ color: '#3F4450' }}>{field.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-0.5">
                                                        <button type="button" 
                                                            onClick={() => {
                                                                if (idx === 0) return;
                                                                const next = [...jiraCustomFields];
                                                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                                                setJiraCustomFields(next);
                                                            }}
                                                            disabled={idx === 0}
                                                            className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            <ArrowUp className="w-3.5 h-3.5" style={{ color: '#4141A2' }} />
                                                        </button>
                                                        <button type="button" 
                                                            onClick={() => {
                                                                if (idx === jiraCustomFields.length - 1) return;
                                                                const next = [...jiraCustomFields];
                                                                [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                                                                setJiraCustomFields(next);
                                                            }}
                                                            disabled={idx === jiraCustomFields.length - 1}
                                                            className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            <ArrowDown className="w-3.5 h-3.5" style={{ color: '#4141A2' }} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Error */}
                            {jiraConfigError && (
                                <div className="rounded-lg p-3 mb-3 flex items-center gap-2" style={{ background: '#FFF5F5', border: '1px solid rgba(250,67,56,0.2)' }}>
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FA4338' }} />
                                    <span className="text-xs" style={{ color: '#FA4338' }}>{jiraConfigError}</span>
                                </div>
                            )}

                            {/* Test result */}
                            {jiraTestResult && (
                                <div className="rounded-lg p-3 mb-3 flex items-start gap-2" style={{
                                    background: jiraTestResult.ok ? '#EBF5EF' : '#FFF5F5',
                                    border: `1px solid ${jiraTestResult.ok ? 'rgba(33,148,78,0.2)' : 'rgba(250,67,56,0.2)'}`,
                                }}>
                                    {jiraTestResult.ok
                                        ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#21944E' }} />
                                        : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#FA4338' }} />}
                                    <span className="text-xs" style={{ color: jiraTestResult.ok ? '#21944E' : '#FA4338' }}>{jiraTestResult.message}</span>
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex gap-3 flex-wrap">
                                <button
                                    onClick={testJiraConnection}
                                    disabled={jiraTesting || !jiraHost || !jiraEmail}
                                    className="btn-ghost"
                                >
                                    {jiraTesting
                                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                                        : <Wifi className="w-4 h-4" />}
                                    {jiraTesting ? 'Testing...' : 'Test Connection'}
                                </button>
                                <button
                                    onClick={saveJiraConfig}
                                    disabled={jiraConfigSaving || !jiraHost || !jiraEmail}
                                    className="btn-primary"
                                >
                                    {jiraConfigSaving
                                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                                        : jiraConfigSaved
                                            ? <CheckCircle className="w-4 h-4" />
                                            : null}
                                    {jiraConfigSaving ? 'Saving...' : jiraConfigSaved ? 'Saved!' : 'Save Configuration'}
                                </button>
                                <button
                                    onClick={async () => {
                                        setJiraIdSyncing(true);
                                        setJiraIdSyncResult(null);
                                        try {
                                            const r = await fetch('/api/integrations/jira/sync-users', { method: 'POST' });
                                            const d = await r.json();
                                            if (d.error) setJiraIdSyncResult(`✗ ${d.error}`);
                                            else setJiraIdSyncResult(`✓ Matched ${d.matched} of ${d.total} developers to Jira accounts (${d.unmatched} unmatched)`);
                                        } catch { setJiraIdSyncResult('✗ Sync failed'); }
                                        finally { setJiraIdSyncing(false); }
                                    }}
                                    disabled={jiraIdSyncing || !jiraIsConfigured}
                                    className="btn-ghost"
                                    title="Look up each developer's email in Jira to store their real account ID"
                                >
                                    {jiraIdSyncing
                                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                                        : <Users className="w-4 h-4" />}
                                    {jiraIdSyncing ? 'Syncing IDs...' : 'Sync Jira User IDs'}
                                </button>
                            </div>
                            {jiraIdSyncResult && (
                                <div className="mt-3 rounded-lg p-3 flex items-center gap-2" style={{
                                    background: jiraIdSyncResult.startsWith('✓') ? '#EBF5EF' : '#FFF5F5',
                                    border: `1px solid ${jiraIdSyncResult.startsWith('✓') ? 'rgba(33,148,78,0.2)' : 'rgba(250,67,56,0.2)'}`,
                                }}>
                                    {jiraIdSyncResult.startsWith('✓')
                                        ? <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#21944E' }} />
                                        : <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FA4338' }} />}
                                    <span className="text-xs font-medium" style={{ color: jiraIdSyncResult.startsWith('✓') ? '#21944E' : '#FA4338' }}>
                                        {jiraIdSyncResult}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Sync controls */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium" style={{ color: '#3F4450' }}>Sync Now</p>
                            {lastSync
                                ? <p className="text-[11px]" style={{ color: '#A4A9B6' }}>
                                    Last synced: {new Date(lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                  </p>
                                : <p className="text-[11px]" style={{ color: '#A4A9B6' }}>Never synced</p>
                            }
                        </div>
                        <button
                            onClick={handleJiraSync}
                            disabled={syncing || !jiraIsConfigured}
                            className="btn-primary"
                            title={!jiraIsConfigured ? 'Configure Jira credentials first' : ''}
                        >
                            {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {syncing ? 'Syncing...' : 'Sync Tickets'}
                        </button>
                    </div>

                    {/* Sync result / error */}
                    {syncResult && (
                        <div className="mt-3 rounded-lg p-3 flex items-center gap-2" style={{ background: '#EBF5EF', border: '1px solid rgba(33,148,78,0.2)' }}>
                            <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#21944E' }} />
                            <span className="text-xs font-medium" style={{ color: '#21944E' }}>{syncResult}</span>
                        </div>
                    )}
                    {syncError && (
                        <div className="mt-3 rounded-lg p-3 flex items-center gap-2" style={{ background: '#FFF5F5', border: '1px solid rgba(250,67,56,0.2)' }}>
                            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FA4338' }} />
                            <span className="text-xs" style={{ color: '#FA4338' }}>{syncError}</span>
                        </div>
                    )}

                    {/* How it works */}
                    <div className="mt-4 rounded-xl p-4" style={{ background: '#F6F6F9' }}>
                        <h3 className="text-[10px] font-semibold mb-2" style={{ color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>How classification works</h3>
                        <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: '#717684' }}>
                            <div className="flex items-start gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#21944E' }} />
                                Stories on capitalizable DEV projects → <strong style={{ color: '#21944E' }}>Capitalize</strong>
                            </div>
                            <div className="flex items-start gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#FA4338' }} />
                                Bugs, Tasks, or non-cap projects → <strong style={{ color: '#FA4338' }}>Expense</strong>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Payroll Upload */}
                <div className="glass-card p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EBF5EF' }}>
                            <Upload className="w-5 h-5" style={{ color: '#21944E' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Payroll Upload</h2>
                            <p className="text-xs" style={{ color: '#A4A9B6' }}>Update salaries via CSV file upload</p>
                        </div>
                    </div>

                    <div
                        className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 mb-4 transition-all"
                        style={{
                            borderColor: dragging ? '#21944E' : '#E2E4E9',
                            background: dragging ? '#EBF5EF' : '#F6F6F9',
                            minHeight: 100,
                            cursor: 'pointer',
                        }}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="w-6 h-6" style={{ color: dragging ? '#21944E' : '#A4A9B6' }} />
                        <p className="text-xs font-medium" style={{ color: '#717684' }}>
                            {dragging ? 'Drop to upload' : 'Drag & drop CSV or click to browse'}
                        </p>
                        <p className="text-[10px]" style={{ color: '#A4A9B6' }}>email, monthlySalary, stockCompAllocation</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) await handleFileUpload(file);
                            }}
                        />
                    </div>

                    <div className="rounded-xl p-3 mb-4" style={{ background: '#FFF5F5', border: '1px solid rgba(250,67,56,0.15)' }}>
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#FA4338' }} />
                            <p className="text-xs" style={{ color: '#717684' }}>
                                Must include <span className="font-medium" style={{ color: '#3F4450' }}>email</span> to match developers.
                            </p>
                        </div>
                    </div>

                    {uploading && (
                        <div className="flex items-center gap-2 text-sm" style={{ color: '#A4A9B6' }}>
                            <Upload className="w-4 h-4 animate-bounce" /> Processing...
                        </div>
                    )}
                    {uploadResult && (
                        <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="w-4 h-4" style={{ color: '#21944E' }} />
                            <span style={{ color: '#21944E' }}>{uploadResult}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* GitHub Integration */}
            <div className="glass-card p-6 mb-6">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F6F6F9' }}>
                            <Github className="w-5 h-5" style={{ color: '#3F4450' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>GitHub Integration</h2>
                            <p className="text-xs" style={{ color: '#A4A9B6' }}>Auto-classify PRs as capitalized or expensed</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {ghLastSync && <span className="text-xs" style={{ color: '#A4A9B6' }}>Last sync: {new Date(ghLastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                        <button onClick={syncGitHub} disabled={ghSyncing || ghRepos.length === 0} className="btn-primary">
                            {ghSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {ghSyncing ? 'Syncing...' : 'Sync PRs'}
                        </button>
                    </div>
                </div>

                {ghSyncResult && (
                    <div className="mb-4 text-xs font-medium" style={{ color: ghSyncResult.startsWith('✓') ? '#21944E' : '#FA4338' }}>{ghSyncResult}</div>
                )}

                {/* Connected Repos */}
                <div className="rounded-xl p-4 mb-5" style={{ background: '#F6F6F9' }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: '#3F4450' }}>Connected Repos</p>
                    <div className="flex items-center gap-2 mb-4">
                        <input
                            className="form-input flex-1"
                            placeholder="owner/repo-name"
                            value={ghNewRepo}
                            onChange={(e) => setGhNewRepo(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addGhRepo()}
                        />
                        <button onClick={addGhRepo} className="btn-primary" disabled={!ghNewRepo.includes('/')}>
                            <LinkIcon className="w-4 h-4" /> Connect
                        </button>
                    </div>

                    {ghRepos.length === 0 ? (
                        <p className="text-xs text-center py-4" style={{ color: '#A4A9B6' }}>No repos connected yet. Add one above using format <code>owner/repo</code>.</p>
                    ) : (
                        <div className="space-y-2">
                            {ghRepos.map((repo) => (
                                <div key={repo.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#fff', border: '1px solid #E2E4E9' }}>
                                    <Github className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#3F4450' }} />
                                    <span className="text-xs font-semibold flex-1" style={{ color: '#3F4450' }}>{repo.owner}/{repo.name}</span>
                                    <select
                                        className="form-select text-xs"
                                        style={{ width: 180 }}
                                        value={repo.projectId || ''}
                                        onChange={(e) => mapGhRepo(repo.id, e.target.value)}
                                    >
                                        <option value="">— Unmapped —</option>
                                        {ghProjects.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.epicKey})</option>
                                        ))}
                                    </select>
                                    <button onClick={() => removeGhRepo(repo.id)} className="p-1 rounded hover:bg-red-50">
                                        <Unlink className="w-3.5 h-3.5" style={{ color: '#FA4338' }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* PR Events Table */}
                {ghEvents.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold" style={{ color: '#3F4450' }}>Recent PRs</p>
                            <div className="flex items-center gap-1">
                                {['ALL', 'CAPITALIZE', 'EXPENSE', 'UNCLASSIFIED'].map((f) => (
                                    <button
                                        key={f}
                                        onClick={() => { setGhFilter(f); loadGhEvents(f); }}
                                        className="text-[10px] px-2 py-0.5 rounded-full font-semibold transition-all"
                                        style={{
                                            background: ghFilter === f ? '#4141A2' : '#F6F6F9',
                                            color: ghFilter === f ? '#fff' : '#717684',
                                        }}
                                    >{f === 'ALL' ? 'All' : f}</button>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E4E9' }}>
                            <table className="w-full text-xs">
                                <thead>
                                    <tr style={{ background: '#F6F6F9', borderBottom: '1px solid #E2E4E9' }}>
                                        <th className="px-3 py-2 text-left" style={{ color: '#A4A9B6' }}>PULL REQUEST</th>
                                        <th className="px-3 py-2 text-left" style={{ color: '#A4A9B6' }}>REPO</th>
                                        <th className="px-3 py-2 text-left" style={{ color: '#A4A9B6' }}>AUTHOR</th>
                                        <th className="px-3 py-2 text-left" style={{ color: '#A4A9B6' }}>MERGED</th>
                                        <th className="px-3 py-2 text-left" style={{ color: '#A4A9B6' }}>CLASSIFICATION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ghEvents.map((ev) => {
                                        const clsBadge = ev.classification === 'CAPITALIZE'
                                            ? { bg: '#EBF5EF', color: '#21944E' }
                                            : ev.classification === 'EXPENSE'
                                            ? { bg: '#FFF5F5', color: '#FA4338' }
                                            : { bg: '#F6F6F9', color: '#A4A9B6' };
                                        return (
                                            <tr key={ev.id} style={{ borderBottom: '1px solid #F6F6F9' }}>
                                                <td className="px-3 py-2.5">
                                                    <a href={ev.url || '#'} target="_blank" rel="noreferrer"
                                                        className="hover:underline" style={{ color: '#4141A2' }}>{ev.title}</a>
                                                </td>
                                                <td className="px-3 py-2.5" style={{ color: '#717684' }}>{ev.repoOwner}/{ev.repoName}</td>
                                                <td className="px-3 py-2.5" style={{ color: '#717684' }}>{ev.author}</td>
                                                <td className="px-3 py-2.5" style={{ color: '#A4A9B6' }}>
                                                    {ev.mergedAt ? new Date(ev.mergedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <span className="badge font-semibold" style={clsBadge}>{ev.classification || 'UNCLASSIFIED'}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[10px] mt-2" style={{ color: '#A4A9B6' }}>
                            Requires <code>GITHUB_TOKEN</code> env var. Webhook endpoint: <code>POST /api/webhooks/github</code>
                        </p>
                    </div>
                )}
            </div>

            {/* Roster Sync */}
            <div className="glass-card p-6 mb-6">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8F4F8' }}>
                        <Users className="w-5 h-5" style={{ color: '#4141A2' }} />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Employee Roster Sync</h2>
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>Import developers from BambooHR or CSV upload</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* BambooHR */}
                    <div className="rounded-xl p-4" style={{ background: '#F6F6F9' }}>
                        <p className="text-xs font-semibold mb-3" style={{ color: '#3F4450' }}>BambooHR</p>
                        <div className="space-y-3 mb-3">
                            <div>
                                <label className="form-label" style={{ fontSize: 10 }}>Subdomain</label>
                                <input className="form-input" placeholder="mycompany" value={bambooSubdomain} onChange={(e) => setBambooSubdomain(e.target.value)} />
                            </div>
                            <div>
                                <label className="form-label" style={{ fontSize: 10 }}>API Key <span className="font-normal" style={{ color: '#A4A9B6' }}>(not stored)</span></label>
                                <input type="password" className="form-input" placeholder="••••••••••••" value={bambooKey} onChange={(e) => setBambooKey(e.target.value)} />
                            </div>
                        </div>
                        <button onClick={previewBamboo} disabled={!bambooSubdomain || !bambooKey || bambooPreviewing} className="btn-primary w-full justify-center mb-3">
                            {bambooPreviewing ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                            {bambooPreviewing ? 'Loading...' : 'Preview Employees'}
                        </button>
                        {bambooError && <p className="text-xs mb-2" style={{ color: '#FA4338' }}>{bambooError}</p>}
                        {bambooResult && <p className="text-xs" style={{ color: '#21944E' }}>{bambooResult}</p>}
                        {bambooPreview.length > 0 && (
                            <div>
                                <div className="max-h-48 overflow-y-auto rounded-lg border mb-3" style={{ borderColor: '#E2E4E9' }}>
                                    {bambooPreview.map((emp, i) => (
                                        <div key={i} className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #F6F6F9', background: '#fff' }}>
                                            <input type="checkbox" checked={!!emp.selected && !emp.alreadyExists} disabled={emp.alreadyExists}
                                                onChange={() => setBambooPreview((prev) => prev.map((e, j) => j === i ? { ...e, selected: !e.selected } : e))} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold truncate" style={{ color: '#3F4450' }}>{emp.name}</p>
                                                <p className="text-[10px] truncate" style={{ color: '#A4A9B6' }}>{emp.email}</p>
                                            </div>
                                            <span className="badge text-[10px]" style={{ background: '#E8F4F8', color: '#4141A2' }}>{emp.role}</span>
                                            {emp.alreadyExists && <span className="text-[10px]" style={{ color: '#A4A9B6' }}>exists</span>}
                                        </div>
                                    ))}
                                </div>
                                <button onClick={importBamboo} disabled={bambooImporting || !bambooPreview.some((e) => e.selected && !e.alreadyExists)} className="btn-primary w-full justify-center">
                                    {bambooImporting ? 'Importing...' : `Import ${bambooPreview.filter((e) => e.selected && !e.alreadyExists).length} Employees`}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* CSV Import */}
                    <div className="rounded-xl p-4" style={{ background: '#F6F6F9' }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: '#3F4450' }}>CSV Import</p>
                        <p className="text-[10px] mb-3" style={{ color: '#A4A9B6' }}>Required: <code>name, email, role</code> · Optional: <code>monthlySalary, jiraUserId</code></p>
                        <div
                            className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 mb-3 transition-all"
                            style={{ borderColor: rosterDragging ? '#4141A2' : '#E2E4E9', background: rosterDragging ? '#F0EAF8' : '#fff', minHeight: 90, cursor: 'pointer' }}
                            onDragOver={(e) => { e.preventDefault(); setRosterDragging(true); }}
                            onDragLeave={() => setRosterDragging(false)}
                            onDrop={async (e) => { e.preventDefault(); setRosterDragging(false); const f = e.dataTransfer.files[0]; if (f) await handleRosterFile(f); }}
                            onClick={() => rosterFileRef.current?.click()}
                        >
                            <Upload className="w-5 h-5" style={{ color: rosterDragging ? '#4141A2' : '#A4A9B6' }} />
                            <p className="text-xs" style={{ color: '#717684' }}>Drop CSV or click to browse</p>
                            <input ref={rosterFileRef} type="file" accept=".csv" className="hidden"
                                onChange={async (e) => { const f = e.target.files?.[0]; if (f) await handleRosterFile(f); }} />
                        </div>
                        {rosterPreviewing && <p className="text-xs" style={{ color: '#A4A9B6' }}>Parsing CSV…</p>}
                        {rosterError && <p className="text-xs mb-2" style={{ color: '#FA4338' }}>{rosterError}</p>}
                        {rosterResult && <p className="text-xs mb-2" style={{ color: '#21944E' }}>{rosterResult}</p>}
                        {rosterPreview.length > 0 && (
                            <div>
                                <div className="max-h-48 overflow-y-auto rounded-lg border mb-3" style={{ borderColor: '#E2E4E9' }}>
                                    {rosterPreview.map((row, i) => (
                                        <div key={i} className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #F6F6F9', background: '#fff' }}>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold truncate" style={{ color: '#3F4450' }}>{row.name}</p>
                                                <p className="text-[10px] truncate" style={{ color: '#A4A9B6' }}>{row.email} · {row.monthlySalary ? `$${row.monthlySalary.toLocaleString()}/mo` : 'No salary'}</p>
                                            </div>
                                            <span className="badge text-[10px]" style={{ background: '#E8F4F8', color: '#4141A2' }}>{row.role}</span>
                                            {row.alreadyExists && <span className="text-[10px]" style={{ color: '#A4A9B6' }}>exists</span>}
                                        </div>
                                    ))}
                                </div>
                                <button onClick={importRoster} disabled={rosterImporting} className="btn-primary w-full justify-center">
                                    {rosterImporting ? 'Importing...' : `Import ${rosterPreview.filter((r) => !r.alreadyExists).length} Developers`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Classification Rule Engine */}
            <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F5F3FF' }}>
                            <ListFilter className="w-5 h-5" style={{ color: '#4141A2' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Classification Rules</h2>
                            <p className="text-xs" style={{ color: '#A4A9B6' }}>Priority-ordered rules that determine how each ticket is classified</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={resetRules} className="btn-ghost text-xs" style={{ color: '#A4A9B6' }}>
                            <RotateCcw className="w-3.5 h-3.5" /> Reset to Defaults
                        </button>
                        <button onClick={saveRules} disabled={rulesSaving} className="btn-primary">
                            {rulesSaved ? <><CheckCircle className="w-4 h-4" /> Saved</> : 'Save Rules'}
                        </button>
                    </div>
                </div>

                <div className="rounded-xl p-3 mb-5" style={{ background: '#F5F3FF', border: '1px solid rgba(65,65,162,0.15)' }}>
                    <p className="text-xs" style={{ color: '#717684' }}>
                        Rules are evaluated in priority order (top to bottom). The <strong>first matching rule</strong> wins. Unmatched tickets default to <span className="font-medium" style={{ color: '#FA4338' }}>EXPENSE</span>.
                    </p>
                </div>

                {rulesLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
                    </div>
                ) : (
                    <div className="rounded-xl border overflow-hidden mb-5" style={{ borderColor: '#E2E4E9' }}>
                        <table className="w-full text-xs">
                            <thead>
                                <tr style={{ background: '#F6F6F9', borderBottom: '2px solid #E2E4E9' }}>
                                    <th className="px-3 py-2.5 text-left w-8" style={{ color: '#A4A9B6' }}>#</th>
                                    <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>ISSUE TYPE</th>
                                    <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>PROJECT STATUS</th>
                                    <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>CAPITALIZABLE</th>
                                    <th className="px-3 py-2.5 text-left" style={{ color: '#A4A9B6' }}>ACTION</th>
                                    <th className="px-3 py-2.5 text-right" style={{ color: '#A4A9B6' }}>REORDER</th>
                                    <th className="px-3 py-2.5 w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((rule, i) => {
                                    const badge = actionBadge(rule.action);
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid #E2E4E9' }}>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <GripVertical className="w-3.5 h-3.5" style={{ color: '#D3D5DB' }} />
                                                    <span className="font-semibold tabular-nums" style={{ color: '#A4A9B6' }}>{i + 1}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className="badge" style={{ background: '#F6F6F9', color: '#3F4450', fontFamily: 'monospace' }}>{rule.issueType}</span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className="badge" style={{ background: '#F6F6F9', color: '#3F4450' }}>{rule.projectStatus}</span>
                                            </td>
                                            <td className="px-3 py-3" style={{ color: '#717684' }}>
                                                {rule.projectCapitalizable === null ? 'Any' : rule.projectCapitalizable ? 'Yes' : 'No'}
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className="badge font-semibold" style={{ background: badge.bg, color: badge.color }}>{rule.action}</span>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <div className="flex items-center justify-end gap-0.5">
                                                    <button onClick={() => moveRule(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                                                        <ArrowUp className="w-3 h-3" style={{ color: '#717684' }} />
                                                    </button>
                                                    <button onClick={() => moveRule(i, 1)} disabled={i === rules.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                                                        <ArrowDown className="w-3 h-3" style={{ color: '#717684' }} />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <button onClick={() => removeRule(i)} className="p-1 rounded hover:bg-red-50">
                                                    <Trash2 className="w-3.5 h-3.5" style={{ color: '#FA4338' }} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Add Rule Form */}
                <div className="rounded-xl border p-4" style={{ borderColor: '#E2E4E9', background: '#F6F6F9' }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: '#3F4450' }}>Add New Rule</p>
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className="form-label" style={{ fontSize: 10 }}>Issue Type</label>
                            <select value={newRule.issueType} onChange={(e) => setNewRule({ ...newRule, issueType: e.target.value })} className="form-select" style={{ width: 110 }}>
                                {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="form-label" style={{ fontSize: 10 }}>Project Status</label>
                            <select value={newRule.projectStatus} onChange={(e) => setNewRule({ ...newRule, projectStatus: e.target.value })} className="form-select" style={{ width: 120 }}>
                                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="form-label" style={{ fontSize: 10 }}>Capitalizable?</label>
                            <select
                                value={newRule.projectCapitalizable === null ? 'null' : newRule.projectCapitalizable ? 'true' : 'false'}
                                onChange={(e) => setNewRule({ ...newRule, projectCapitalizable: e.target.value === 'null' ? null : e.target.value === 'true' })}
                                className="form-select"
                                style={{ width: 140 }}
                            >
                                {CAP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="form-label" style={{ fontSize: 10 }}>Action</label>
                            <select value={newRule.action} onChange={(e) => setNewRule({ ...newRule, action: e.target.value })} className="form-select" style={{ width: 130 }}>
                                <option value="CAPITALIZE">CAPITALIZE</option>
                                <option value="EXPENSE">EXPENSE</option>
                            </select>
                        </div>
                        <button onClick={addRule} className="btn-primary">
                            <Plus className="w-4 h-4" /> Add Rule
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
