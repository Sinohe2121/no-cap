'use client';

import { useEffect, useState } from 'react';
import { Settings, Users, Save, Shield } from 'lucide-react';

interface Config {
    id: string;
    key: string;
    value: string;
    label: string;
}

interface AppUser {
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: string;
}

export default function AdminPage() {
    const [configs, setConfigs] = useState<Config[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [saved, setSaved] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/admin')
            .then((res) => res.json())
            .then((data) => {
                setConfigs(data.configs);
                setUsers(data.users);
                const vals: Record<string, string> = {};
                data.configs.forEach((c: Config) => { vals[c.key] = c.value; });
                setEditValues(vals);
            })
            .finally(() => setLoading(false));
    }, []);

    const saveConfig = async (key: string) => {
        await fetch('/api/admin', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'config', key, value: editValues[key] }),
        });
        setSaved(key);
        setTimeout(() => setSaved(null), 2000);
    };

    const toggleRole = async (user: AppUser) => {
        const newRole = user.role === 'ADMIN' ? 'VIEWER' : 'ADMIN';
        await fetch('/api/admin', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'user_role', id: user.id, role: newRole }),
        });
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    const configDescriptions: Record<string, { icon: string; desc: string }> = {
        FRINGE_BENEFIT_RATE: { icon: '💰', desc: 'Multiplier applied to base salary (e.g., 0.25 = 25% for benefits)' },
        DEFAULT_AMORTIZATION_LIFE: { icon: '📅', desc: 'Number of months for straight-line amortization (standard: 36)' },
        CAPITALIZATION_THRESHOLD: { icon: '🎯', desc: 'Minimum dollar amount to capitalize (0 = no threshold)' },
    };

    return (
        <div>
            <div className="mb-8">
                <h1 className="section-header">Admin Portal</h1>
                <p className="section-subtext">Global configuration and user management</p>
            </div>

            {/* Global Config */}
            <div className="glass-card p-6 mb-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F0EAF8' }}>
                        <Settings className="w-5 h-5" style={{ color: '#4141A2' }} />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>Global Configuration</h2>
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>System-wide accounting parameters</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {configs.map((config) => {
                        const meta = configDescriptions[config.key] || { icon: '⚙️', desc: '' };
                        return (
                            <div key={config.key} className="rounded-xl p-4" style={{ background: '#F6F6F9' }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-lg">{meta.icon}</span>
                                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#3F4450' }}>{config.label}</span>
                                </div>
                                <p className="text-[11px] mb-3" style={{ color: '#A4A9B6' }}>{meta.desc}</p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={editValues[config.key] || ''}
                                        onChange={(e) => setEditValues({ ...editValues, [config.key]: e.target.value })}
                                        className="form-input text-lg font-bold"
                                    />
                                    <button
                                        onClick={() => saveConfig(config.key)}
                                        className="btn-ghost"
                                        style={saved === config.key ? { color: '#21944E', borderColor: 'rgba(33,148,78,0.3)' } : {}}
                                    >
                                        <Save className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* User Management */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8F4F8' }}>
                        <Users className="w-5 h-5" style={{ color: '#4141A2' }} />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold" style={{ color: '#3F4450' }}>User Management</h2>
                        <p className="text-xs" style={{ color: '#A4A9B6' }}>Manage application access and roles</p>
                    </div>
                </div>

                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Created</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id}>
                                <td className="text-sm font-semibold" style={{ color: '#3F4450' }}>{user.name}</td>
                                <td className="text-sm">{user.email}</td>
                                <td>
                                    <span className="badge border" style={{
                                        borderColor: user.role === 'ADMIN' ? '#4141A2' : '#A4A9B6',
                                        color: user.role === 'ADMIN' ? '#4141A2' : '#717684',
                                    }}>
                                        <Shield className="w-3 h-3" />
                                        {user.role}
                                    </span>
                                </td>
                                <td className="text-xs" style={{ color: '#A4A9B6' }}>
                                    {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td>
                                    <button onClick={() => toggleRole(user)} className="btn-ghost text-xs">
                                        Toggle {user.role === 'ADMIN' ? 'Viewer' : 'Admin'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
