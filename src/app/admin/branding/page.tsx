'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ImageIcon, ArrowLeft } from 'lucide-react';

export default function BrandingPage() {
    const [logoVal, setLogoVal] = useState<string>('');
    const [logoSaving, setLogoSaving] = useState(false);
    const [logoSaved, setLogoSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin')
            .then((res) => res.ok ? res.json() : { configs: [] })
            .then((data) => {
                const logo = data.configs.find((c: any) => c.key === 'COMPANY_LOGO');
                if (logo) setLogoVal(logo.value);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result as string;
            setLogoVal(base64String);
            setLogoSaving(true);
            setLogoSaved(false);

            await fetch('/api/admin', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'config', key: 'COMPANY_LOGO', value: base64String, label: 'Company Logo' }),
            });

            setLogoSaving(false);
            setLogoSaved(true);
            setTimeout(() => setLogoSaved(false), 2500);
        };
        reader.readAsDataURL(file);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--gem)', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    return (
        <div className="pb-12">
            <div className="mb-6">
                <Link href="/admin" className="text-sm font-semibold flex items-center gap-2 mb-4 hover:underline" style={{ color: '#4141A2', width: 'max-content' }}>
                    <ArrowLeft className="w-4 h-4" /> Back to Admin Portal
                </Link>
                <h1 className="section-header">System Branding</h1>
                <p className="section-subtext">Base64 injection matrix governing the global application visual identity logo.</p>
            </div>

            <div className="glass-card p-8">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#FFF4ED' }}>
                            <ImageIcon className="w-6 h-6" style={{ color: '#FA4338' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: '#3F4450' }}>Sidebar Origin Marker</h2>
                            <p className="text-xs font-semibold" style={{ color: '#A4A9B6' }}>Inject a generic scale-wrapper replacement for the default badge.</p>
                        </div>
                    </div>
                    {logoSaved && <span className="text-xs font-black uppercase tracking-wide" style={{ color: '#21944E' }}>✓ Upload Successful</span>}
                    {logoSaving && <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#A4A9B6' }}>Uploading to Cloud…</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest mb-4" style={{ color: '#717684' }}>Source File Ingestion</p>
                        <div className="p-5 rounded-xl border border-[#E2E4E9]" style={{ background: '#F9FAFB' }}>
                            <input 
                                type="file" 
                                accept="image/*" 
                                onChange={handleLogoUpload}
                                className="block w-full text-sm font-semibold file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-[12px] file:font-black file:uppercase file:tracking-widest file:bg-[#4141A2] file:text-white hover:file:bg-[#3F4450] transition-colors cursor-pointer"
                                style={{ color: '#A4A9B6' }}
                            />
                        </div>
                        <p className="text-[12px] font-medium leading-relaxed mt-4" style={{ color: '#717684' }}>
                            Recommended target specification: Native PNG or SVG mapped with an explicitly transparent background constraint.
                        </p>
                    </div>

                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest mb-4" style={{ color: '#717684' }}>Real-time Rendering View</p>
                        <div className="p-8 rounded-xl flex items-center justify-center border-2 border-dashed transition-all" style={{ background: '#FFFFFF', borderColor: logoVal ? 'rgba(33,148,78,0.3)' : 'rgba(164,169,182,0.3)' }}>
                            {logoVal ? (
                                <img src={logoVal} alt="Company Logo Scale Preview" className="max-h-[80px] object-contain drop-shadow-sm" />
                            ) : (
                                <span className="text-[13px] font-bold uppercase tracking-widest" style={{ color: '#A4A9B6' }}>NO IMAGE BOUND IN DB</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
