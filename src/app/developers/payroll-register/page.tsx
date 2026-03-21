'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileSpreadsheet, Upload, X, Check, AlertCircle, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';

interface Developer {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface PayrollImportRef {
    id: string;
    label: string;
    payDate: string;
    year: number;
}

interface RegisterData {
    developers: Developer[];
    payrollImports: PayrollImportRef[];
    salaryMap: Record<string, Record<string, number>>;
    importTotals: Record<string, number>;
    devTotals: Record<string, number>;
    grandTotal: number;
    yearLabel: string;
}

function formatCurrency(amount: number) {
    if (amount === 0) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function formatCurrencyAlways(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

const roleMap: Record<string, string> = {
    ENG: 'Engineering',
    PRODUCT: 'Product',
    DESIGN: 'Design',
    QA: 'QA',
};

const subTeamMap: Record<string, string> = {
    ENG: 'Platform',
    PRODUCT: 'Growth',
    DESIGN: 'UX',
    QA: 'QA',
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    // RFC 4180-aware field splitter: handles quoted fields with commas inside
    function splitCSVLine(line: string): string[] {
        const fields: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
                else if (ch === '"') { inQuotes = false; }
                else { current += ch; }
            } else {
                if (ch === '"') { inQuotes = true; }
                else if (ch === ',') { fields.push(current.trim()); current = ''; }
                else { current += ch; }
            }
        }
        fields.push(current.trim());
        return fields;
    }

    const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const values = splitCSVLine(line);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = (values[i] || '').replace(/^['"]|['"]$/g, ''); });
        return row;
    });
}

export default function PayrollRegisterPage() {

    const [data, setData] = useState<RegisterData | null>(null);
    const [loading, setLoading] = useState(true);

    // Import modal state
    const [showImport, setShowImport] = useState(false);
    const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
    const [selectedPeriod, setSelectedPeriod] = useState<{ label: string; payDate: string } | null>(null);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Year + month picker state
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const [pickerMonth, setPickerMonth] = useState<number | ''>('');

    // Unmatched developer state
    const [parsedRows, setParsedRows] = useState<{ name: string; email: string; grossSalary: string; sbcAmount: string }[]>([]);
    const [unmatchedDevs, setUnmatchedDevs] = useState<{ name: string; email: string }[]>([]);
    const [selectedUnmatched, setSelectedUnmatched] = useState<Set<string>>(new Set());
    const [creatingDevs, setCreatingDevs] = useState(false);

    const loadData = useCallback(() => {
        setLoading(true);
        fetch('/api/payroll-register')
            .then((res) => res.json())
            .then(setData)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const openImport = () => {
        setShowImport(true);
        setImportStep(1);
        setSelectedPeriod(null);
        setCsvFile(null);
        setImportResult(null);
        setPickerYear(new Date().getFullYear());
        setPickerMonth('');
        setParsedRows([]);
        setUnmatchedDevs([]);
        setSelectedUnmatched(new Set());
    };

    const confirmPeriod = () => {
        if (pickerMonth === '') return;
        const monthIdx = Number(pickerMonth);
        const label = `${MONTH_NAMES[monthIdx]} ${pickerYear}`;
        const lastDay = new Date(pickerYear, monthIdx + 1, 0);
        const payDate = lastDay.toISOString().split('T')[0];
        setSelectedPeriod({ label, payDate });
        setImportStep(2);
    };

    const closeImport = () => {
        setShowImport(false);
        setImportResult(null);
    };

    const stripCurrency = (v: string) => (v || '').replace(/[\$,\s]/g, '');

    const normalizeCsvRows = (text: string) => {
        const parsed = parseCSV(text);
        return parsed.map(row => ({
            name: row['name'] || row['user name'] || row['username'] || row['developer'] || '',
            email: (row['email'] || row['work email'] || row['identifying email'] || row['user email'] || row['workemail'] || '').trim().toLowerCase(),
            grossSalary: stripCurrency(row['salary'] || row['gross salary'] || row['employee gross pay'] || row['amount'] || row['grosssalary'] || row['pay'] || '0'),
            sbcAmount: stripCurrency(row['sbc'] || row['stock based compensation'] || row['stock comp'] || row['sbc expense'] || '0'),
        }));
    };

    const handleCheckAndImport = async () => {
        if (!selectedPeriod || !csvFile) return;
        setImporting(true);
        try {
            const text = await csvFile.text();
            const rows = normalizeCsvRows(text);
            setParsedRows(rows);

            // Get all existing developer emails
            const devRes = await fetch('/api/developers');
            const devData = await devRes.json();
            const existingEmails = new Set<string>(
                (devData.developers || devData || []).map((d: any) => (d.email || '').toLowerCase())
            );

            // Find unmatched
            const seen = new Set<string>();
            const unmatched: { name: string; email: string }[] = [];
            for (const row of rows) {
                if (row.email && !existingEmails.has(row.email) && !seen.has(row.email)) {
                    unmatched.push({ name: row.name, email: row.email });
                    seen.add(row.email);
                }
            }

            if (unmatched.length > 0) {
                // Show Step 3 — let user choose which to add
                setUnmatchedDevs(unmatched);
                setSelectedUnmatched(new Set(unmatched.map(d => d.email))); // select all by default
                setImportStep(3);
                setImporting(false);
            } else {
                // No unmatched — go straight to import
                await doImport(rows);
            }
        } catch {
            setImportResult({ imported: 0, skipped: 0, errors: ['Import failed unexpectedly'] });
            setImporting(false);
        }
    };

    const handleCreateAndImport = async () => {
        setCreatingDevs(true);
        try {
            // Create selected unmatched developers
            if (selectedUnmatched.size > 0) {
                const devsToCreate = unmatchedDevs.filter(d => selectedUnmatched.has(d.email));
                await fetch('/api/developers/bulk-create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ developers: devsToCreate }),
                });
            }
            // Now import payroll
            await doImport(parsedRows);
        } catch {
            setImportResult({ imported: 0, skipped: 0, errors: ['Failed to create developers'] });
        } finally {
            setCreatingDevs(false);
        }
    };

    const doImport = async (rows: { name: string; email: string; grossSalary: string; sbcAmount: string }[]) => {
        setImporting(true);
        try {
            const res = await fetch('/api/payroll-register/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label: selectedPeriod!.label,
                    payDate: selectedPeriod!.payDate,
                    rows,
                }),
            });
            const result = await res.json();
            setImportResult({
                imported: result.imported ?? 0,
                skipped: result.skipped ?? 0,
                errors: result.errors ?? (result.error ? [result.error] : []),
            });
            loadData();
        } catch {
            setImportResult({ imported: 0, skipped: 0, errors: ['Import failed unexpectedly'] });
        } finally {
            setImporting(false);
        }
    };

    const toggleUnmatched = (email: string) => {
        setSelectedUnmatched(prev => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email); else next.add(email);
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

    if (!data || data.payrollImports.length === 0) {
        return (
            <div>
                <div className="mb-4">
                    <Link href="/developers" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to FTE & Payroll
                    </Link>
                </div>
                <div className="glass-card p-12 text-center">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-4" style={{ color: '#A4A9B6' }} />
                    <h2 className="text-lg font-semibold mb-2" style={{ color: '#3F4450' }}>No Payroll Data</h2>
                    <p className="text-sm mb-6" style={{ color: '#A4A9B6' }}>Import your first payroll period to populate the register.</p>
                    <button onClick={openImport} className="btn-primary">
                        <Upload className="w-4 h-4" /> Import Payroll Period
                    </button>
                </div>

                {/* Import Modal */}
                {showImport && renderImportModal()}
            </div>
        );
    }

    const { developers, payrollImports, salaryMap, importTotals, devTotals, grandTotal, yearLabel } = data;

    function renderImportModal() {
        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
                onClick={(e) => { if (e.target === e.currentTarget) closeImport(); }}
            >
                <div className="glass-card w-full max-w-lg mx-4 p-6" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-base font-bold" style={{ color: '#3F4450' }}>
                            {importResult ? 'Import Complete' : importStep === 1 ? 'Select Pay Period' : importStep === 3 ? 'New Developers Found' : 'Upload CSV'}
                        </h2>
                        <button onClick={closeImport} className="btn-ghost" style={{ padding: '4px' }}>
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Result view */}
                    {importResult ? (
                        <div>
                            <div className="flex items-center gap-3 mb-4 p-4 rounded-xl" style={{ background: importResult.imported > 0 ? '#EBF5EF' : '#FFF5F5' }}>
                                {importResult.imported > 0 ? (
                                    <Check className="w-5 h-5" style={{ color: '#21944E' }} />
                                ) : (
                                    <AlertCircle className="w-5 h-5" style={{ color: '#FA4338' }} />
                                )}
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>
                                        {importResult.imported} entries imported, {importResult.skipped} skipped
                                    </p>
                                </div>
                            </div>
                            {importResult.errors.length > 0 && (
                                <div className="mb-4 space-y-1">
                                    {importResult.errors.map((err, i) => (
                                        <p key={i} className="text-xs" style={{ color: '#FA4338' }}>{err}</p>
                                    ))}
                                </div>
                            )}
                            <button onClick={closeImport} className="btn-primary w-full">Done</button>
                        </div>
                    ) : importStep === 1 ? (
                        /* Step 1: Select period — year chevrons + month dropdown */
                        <div>
                            <p className="text-sm mb-6" style={{ color: '#717684' }}>What pay period is this for?</p>

                            {/* Year Selector */}
                            <div className="flex items-center justify-center gap-4 mb-6">
                                <button
                                    onClick={() => setPickerYear(y => y - 1)}
                                    className="w-9 h-9 rounded-lg border flex items-center justify-center transition-all hover:bg-gray-50 active:scale-95"
                                    style={{ borderColor: '#E2E4E9', color: '#3F4450' }}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-lg font-bold tabular-nums" style={{ color: '#3F4450', minWidth: 60, textAlign: 'center' }}>
                                    {pickerYear}
                                </span>
                                <button
                                    onClick={() => setPickerYear(y => y + 1)}
                                    className="w-9 h-9 rounded-lg border flex items-center justify-center transition-all hover:bg-gray-50 active:scale-95"
                                    style={{ borderColor: '#E2E4E9', color: '#3F4450' }}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Month Dropdown */}
                            <select
                                value={pickerMonth}
                                onChange={(e) => setPickerMonth(e.target.value === '' ? '' : Number(e.target.value))}
                                className="form-input w-full mb-6 text-sm"
                                style={{ color: pickerMonth === '' ? '#A4A9B6' : '#3F4450' }}
                            >
                                <option value="">Select a month</option>
                                {MONTH_NAMES.map((m, i) => (
                                    <option key={i} value={i}>{m}</option>
                                ))}
                            </select>

                            <button
                                onClick={confirmPeriod}
                                className="btn-primary w-full"
                                disabled={pickerMonth === ''}
                                style={{ opacity: pickerMonth !== '' ? 1 : 0.5 }}
                            >
                                Continue
                            </button>
                        </div>
                    ) : importStep === 2 ? (
                        /* Step 2: Upload CSV */
                        <div>
                            <p className="text-sm mb-1" style={{ color: '#717684' }}>
                                Importing for: <strong style={{ color: '#4141A2' }}>{selectedPeriod?.label}</strong>
                            </p>
                            <p className="text-xs mb-4" style={{ color: '#A4A9B6' }}>
                                Upload a CSV with columns: <strong>name</strong>, <strong>work email</strong>, <strong>employee gross pay</strong>, <strong>sbc</strong>
                            </p>

                            <div
                                className="rounded-xl p-8 text-center border-2 border-dashed mb-6 transition-colors cursor-pointer"
                                style={{
                                    borderColor: csvFile ? '#21944E' : '#E2E4E9',
                                    background: csvFile ? '#EBF5EF' : '#F6F6F9',
                                }}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                                />
                                {csvFile ? (
                                    <div>
                                        <Check className="w-6 h-6 mx-auto mb-2" style={{ color: '#21944E' }} />
                                        <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{csvFile.name}</p>
                                        <p className="text-xs" style={{ color: '#A4A9B6' }}>{(csvFile.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                ) : (
                                    <div>
                                        <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: '#A4A9B6' }} />
                                        <p className="text-sm font-medium" style={{ color: '#717684' }}>Click to select CSV file</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <button onClick={() => setImportStep(1)} className="btn-ghost flex-1">Back</button>
                                <button
                                    onClick={handleCheckAndImport}
                                    className="btn-primary flex-1"
                                    disabled={!csvFile || importing}
                                    style={{ opacity: csvFile && !importing ? 1 : 0.5 }}
                                >
                                    {importing ? 'Checking…' : 'Import'}
                                </button>
                            </div>
                        </div>
                    ) : importStep === 3 ? (
                        /* Step 3: Review unmatched developers */
                        <div>
                            <div className="flex items-center gap-2 mb-2 p-3 rounded-lg" style={{ background: '#FFF8E6' }}>
                                <UserPlus className="w-4 h-4 flex-shrink-0" style={{ color: '#B8860B' }} />
                                <p className="text-xs font-medium" style={{ color: '#8B6914' }}>
                                    {unmatchedDevs.length} developer{unmatchedDevs.length > 1 ? 's' : ''} in the CSV {unmatchedDevs.length > 1 ? 'are' : 'is'} not in the roster yet.
                                </p>
                            </div>
                            <p className="text-xs mb-4" style={{ color: '#717684' }}>
                                Select which ones to add as new developers, then continue with the import.
                            </p>

                            {/* Select all / none */}
                            <div className="flex items-center justify-between mb-2">
                                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold" style={{ color: '#3F4450' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedUnmatched.size === unmatchedDevs.length}
                                        onChange={() => {
                                            if (selectedUnmatched.size === unmatchedDevs.length) {
                                                setSelectedUnmatched(new Set());
                                            } else {
                                                setSelectedUnmatched(new Set(unmatchedDevs.map(d => d.email)));
                                            }
                                        }}
                                    />
                                    Select All
                                </label>
                                <span className="text-[10px]" style={{ color: '#A4A9B6' }}>
                                    {selectedUnmatched.size} of {unmatchedDevs.length} selected
                                </span>
                            </div>

                            <div className="max-h-[250px] overflow-y-auto border rounded-lg mb-6" style={{ borderColor: '#E2E4E9' }}>
                                {unmatchedDevs.map((dev) => (
                                    <label
                                        key={dev.email}
                                        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                                        style={{
                                            borderBottom: '1px solid #F0F1F3',
                                            background: selectedUnmatched.has(dev.email) ? '#F8F9FA' : 'transparent',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedUnmatched.has(dev.email)}
                                            onChange={() => toggleUnmatched(dev.email)}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate" style={{ color: '#3F4450' }}>{dev.name}</p>
                                            <p className="text-xs truncate" style={{ color: '#A4A9B6' }}>{dev.email}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            <div className="flex items-center gap-3">
                                <button onClick={() => setImportStep(2)} className="btn-ghost flex-1">Back</button>
                                <button
                                    onClick={handleCreateAndImport}
                                    className="btn-primary flex-1"
                                    disabled={creatingDevs || importing}
                                    style={{ opacity: !creatingDevs && !importing ? 1 : 0.5 }}
                                >
                                    {creatingDevs ? 'Creating…' : importing ? 'Importing…' : selectedUnmatched.size > 0 ? `Add ${selectedUnmatched.size} & Import` : 'Skip & Import'}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-4">
                <Link href="/developers" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline transition-all hover:-translate-x-0.5" style={{ color: '#4141A2' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to FTE & Payroll
                </Link>
            </div>

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-header">Payroll Register</h1>
                    <p className="section-subtext">Total cost (salary + fringe + SBC) by pay period across all developers</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs" style={{ color: '#A4A9B6' }}>
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>{payrollImports.length} pay periods · {developers.length} developers</span>
                    </div>
                    <button onClick={openImport} className="btn-primary text-xs">
                        <Upload className="w-4 h-4" /> Import Payroll Period
                    </button>
                </div>
            </div>

            <div className="glass-card overflow-x-auto">
                <table className="w-full border-collapse text-sm" style={{ minWidth: 800 }}>
                    <thead>
                        {/* Pay date header row */}
                        <tr style={{ borderBottom: '1px solid #E2E4E9' }}>
                            <th className="sticky left-0 z-10 px-4 py-3 text-left" style={{ background: '#FFFFFF', minWidth: 120 }}></th>
                            <th className="px-3 py-3 text-left" style={{ minWidth: 130 }}></th>
                            <th className="px-3 py-3 text-left" style={{ minWidth: 100 }}></th>
                            <th className="px-3 py-3 text-left" style={{ minWidth: 80 }}></th>
                            {payrollImports.map((imp) => (
                                <th
                                    key={imp.id}
                                    className="px-4 py-3 text-right whitespace-nowrap"
                                    style={{ minWidth: 100 }}
                                >
                                    <Link
                                        href={`/developers/payroll-register/${imp.id}`}
                                        className="font-semibold transition-colors hover:underline"
                                        style={{ color: '#4141A2', fontSize: 12 }}
                                    >
                                        {imp.label}
                                    </Link>
                                </th>
                            ))}
                            <th className="px-4 py-3 text-right font-bold whitespace-nowrap" style={{ color: '#3F4450', fontSize: 12, minWidth: 110 }}>
                                {yearLabel}
                            </th>
                        </tr>
                        {/* Column labels */}
                        <tr style={{ borderBottom: '2px solid #E2E4E9' }}>
                            <th className="sticky left-0 z-10 px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6', background: '#FFFFFF' }}>Name</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Title</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Team</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>Sub team</th>
                            {payrollImports.map((imp) => (
                                <th key={imp.id} className="px-4 py-2" />
                            ))}
                            <th className="px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {developers.map((dev) => (
                            <tr key={dev.id} className="transition-colors" style={{ borderBottom: '1px solid #E2E4E9' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F6F9')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                                <td className="sticky left-0 z-10 px-4 py-3 font-medium whitespace-nowrap" style={{ color: '#3F4450', background: 'inherit' }}>
                                    {dev.name}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#717684' }}>
                                    {dev.role === 'ENG' ? 'Software Engineer' : dev.role === 'PRODUCT' ? 'Product Manager' : dev.role === 'DESIGN' ? 'Designer' : dev.role}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#717684' }}>
                                    {roleMap[dev.role] || dev.role}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#717684' }}>
                                    {subTeamMap[dev.role] || '—'}
                                </td>
                                {payrollImports.map((imp) => {
                                    const val = salaryMap[dev.id]?.[imp.id] || 0;
                                    return (
                                        <td key={imp.id} className="px-4 py-3 text-right tabular-nums" style={{ color: val > 0 ? '#3F4450' : '#A4A9B6' }}>
                                            {formatCurrency(val)}
                                        </td>
                                    );
                                })}
                                <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: '#3F4450' }}>
                                    {formatCurrencyAlways(devTotals[dev.id] || 0)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #E2E4E9' }}>
                            <td className="sticky left-0 z-10 px-4 py-3 font-bold" style={{ color: '#3F4450', background: '#FFFFFF' }}>Total</td>
                            <td colSpan={3}></td>
                            {payrollImports.map((imp) => (
                                <td key={imp.id} className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: '#3F4450' }}>
                                    {formatCurrencyAlways(importTotals[imp.id] || 0)}
                                </td>
                            ))}
                            <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: '#FA4338' }}>
                                {formatCurrencyAlways(grandTotal)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Import Modal */}
            {showImport && renderImportModal()}
        </div>
    );
}
