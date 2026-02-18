'use client';

import { useState } from 'react';
import { RefreshCw, Upload, CheckCircle, FileSpreadsheet, AlertCircle } from 'lucide-react';

export default function IntegrationsPage() {
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<string | null>(null);
    const [csvInput, setCsvInput] = useState('');

    const handleJiraSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/integrations/jira-sync', { method: 'POST' });
            const data = await res.json();
            setSyncResult(`✓ ${data.message}`);
        } catch {
            setSyncResult('✗ Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const handlePayrollUpload = async () => {
        if (!csvInput.trim()) return;
        setUploading(true);
        setUploadResult(null);

        try {
            const lines = csvInput.trim().split('\n');
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
            setCsvInput('');
        } catch {
            setUploadResult('✗ Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div>
            <div className="mb-8">
                <h1 className="section-header">Integrations</h1>
                <p className="section-subtext">Data ingestion from Jira and payroll systems</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Jira Sync */}
                <div className="glass-card p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8F4F8' }}>
                            <RefreshCw className="w-5 h-5" style={{ color: '#4141A2' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Jira Sync</h2>
                            <p className="text-xs" style={{ color: '#A4A9B6' }}>Import development activity from Jira</p>
                        </div>
                    </div>

                    <div className="rounded-xl p-4 mb-4" style={{ background: '#F6F6F9' }}>
                        <h3 className="text-xs font-semibold mb-2" style={{ color: '#717684' }}>How it works:</h3>
                        <ul className="text-xs space-y-1.5" style={{ color: '#717684' }}>
                            <li className="flex items-start gap-2">
                                <span style={{ color: '#4141A2' }} className="mt-0.5">•</span>
                                Stories on capitalizable projects in DEV phase → <span className="font-medium" style={{ color: '#21944E' }}>Capitalize</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span style={{ color: '#4141A2' }} className="mt-0.5">•</span>
                                Bugs, Tasks, and non-cap projects → <span className="font-medium" style={{ color: '#FA4338' }}>Expense</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span style={{ color: '#4141A2' }} className="mt-0.5">•</span>
                                Story points map to effort allocation per developer
                            </li>
                        </ul>
                    </div>

                    <button
                        onClick={handleJiraSync}
                        disabled={syncing}
                        className="btn-primary w-full justify-center"
                    >
                        {syncing ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        {syncing ? 'Syncing...' : 'Sync Jira (Mock Data)'}
                    </button>

                    {syncResult && (
                        <div className="mt-4 flex items-center gap-2 text-sm">
                            <CheckCircle className="w-4 h-4" style={{ color: '#21944E' }} />
                            <span style={{ color: '#21944E' }}>{syncResult}</span>
                        </div>
                    )}
                </div>

                {/* Payroll Upload */}
                <div className="glass-card p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EBF5EF' }}>
                            <FileSpreadsheet className="w-5 h-5" style={{ color: '#21944E' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Payroll Upload</h2>
                            <p className="text-xs" style={{ color: '#A4A9B6' }}>Update salaries and stock comp via CSV</p>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="form-label">CSV Data</label>
                        <textarea
                            value={csvInput}
                            onChange={(e) => setCsvInput(e.target.value)}
                            placeholder={`email,monthlySalary,stockCompAllocation\nalice@company.com,16000,2500\nbob@company.com,15000,2000`}
                            rows={6}
                            className="form-input font-mono text-xs"
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    <div className="rounded-xl p-4 mb-4" style={{ background: '#FFF5F5' }}>
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#FA4338' }} />
                            <p className="text-xs" style={{ color: '#717684' }}>
                                CSV must include <span className="font-medium" style={{ color: '#3F4450' }}>email</span> column to match developers.
                                Optional: <span className="font-medium" style={{ color: '#3F4450' }}>name</span>, <span className="font-medium" style={{ color: '#3F4450' }}>monthlySalary</span>, <span className="font-medium" style={{ color: '#3F4450' }}>stockCompAllocation</span>.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handlePayrollUpload}
                        disabled={uploading || !csvInput.trim()}
                        className="btn-primary w-full justify-center"
                    >
                        {uploading ? (
                            <Upload className="w-4 h-4 animate-spin" />
                        ) : (
                            <Upload className="w-4 h-4" />
                        )}
                        {uploading ? 'Uploading...' : 'Upload Payroll Data'}
                    </button>

                    {uploadResult && (
                        <div className="mt-4 flex items-center gap-2 text-sm">
                            <CheckCircle className="w-4 h-4" style={{ color: '#21944E' }} />
                            <span style={{ color: '#21944E' }}>{uploadResult}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
