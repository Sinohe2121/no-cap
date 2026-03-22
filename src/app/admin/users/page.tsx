'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, ArrowLeft, Shield, ShieldAlert, Plus, X, Save, PlusCircle, Trash2, Pencil, Lock, Check } from 'lucide-react';

interface AppUser {
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: string;
}

type Permission =
    | 'VIEW_DASHBOARD' | 'VIEW_REPORTS' | 'VIEW_ENGINEERING_HEALTH' | 'VIEW_TEAM_VIEW'
    | 'VIEW_PAYROLL_SUMMARY' | 'VIEW_PAYROLL_DETAIL' | 'VIEW_COST_ALLOCATION' | 'MANAGE_PAYROLL_IMPORTS'
    | 'VIEW_PROJECTS' | 'EDIT_PROJECTS' | 'VIEW_TICKETS'
    | 'VIEW_ACCOUNTING' | 'MANAGE_PERIODS'
    | 'VIEW_AUDIT' | 'MANAGE_SOC2'
    | 'MANAGE_INTEGRATIONS' | 'MANAGE_USERS' | 'EDIT_SYSTEM_CONFIG';

interface AccessRole {
    id: string;
    name: string;
    isSystem: boolean;
    permissions: Permission[];
}

interface PermissionDef {
    key: Permission;
    label: string;
    confidential: boolean;
}

interface PermissionCategory {
    category: string;
    permissions: PermissionDef[];
}

const PERMISSION_CATEGORIES: PermissionCategory[] = [
    {
        category: 'Dashboard & Analytics',
        permissions: [
            { key: 'VIEW_DASHBOARD', label: 'View dashboard & KPI cards', confidential: false },
            { key: 'VIEW_REPORTS', label: 'View reports & saved graphs', confidential: false },
            { key: 'VIEW_ENGINEERING_HEALTH', label: 'View engineering health metrics', confidential: false },
            { key: 'VIEW_TEAM_VIEW', label: 'View team-level breakdowns', confidential: false },
        ],
    },
    {
        category: 'Payroll & Compensation',
        permissions: [
            { key: 'VIEW_PAYROLL_SUMMARY', label: 'View FTE & Payroll summary charts', confidential: false },
            { key: 'VIEW_PAYROLL_DETAIL', label: 'View payroll register (individual salaries)', confidential: true },
            { key: 'VIEW_COST_ALLOCATION', label: 'View ticket-level cost allocation (loaded costs)', confidential: true },
            { key: 'MANAGE_PAYROLL_IMPORTS', label: 'Import/modify payroll CSV data', confidential: true },
        ],
    },
    {
        category: 'Projects & Tickets',
        permissions: [
            { key: 'VIEW_PROJECTS', label: 'View projects list & details', confidential: false },
            { key: 'EDIT_PROJECTS', label: 'Edit project settings (capitalizability, amortization)', confidential: false },
            { key: 'VIEW_TICKETS', label: 'View tickets & ticket details', confidential: false },
        ],
    },
    {
        category: 'Accounting & Finance',
        permissions: [
            { key: 'VIEW_ACCOUNTING', label: 'View journal entries & financial reports', confidential: true },
            { key: 'MANAGE_PERIODS', label: 'Lock/reopen accounting periods', confidential: true },
        ],
    },
    {
        category: 'Audit & Compliance',
        permissions: [
            { key: 'VIEW_AUDIT', label: 'View audit pack, anomalies, ASU report', confidential: true },
            { key: 'MANAGE_SOC2', label: 'Manage SOC 2 controls, evidence, risks, incidents', confidential: true },
        ],
    },
    {
        category: 'Administration',
        permissions: [
            { key: 'MANAGE_INTEGRATIONS', label: 'Configure & trigger Jira/GitHub/BambooHR syncs', confidential: false },
            { key: 'MANAGE_USERS', label: 'Provision users & edit role permissions', confidential: true },
            { key: 'EDIT_SYSTEM_CONFIG', label: 'Edit accounting standard, fiscal year, branding', confidential: false },
        ],
    },
];

const ALL_PERMISSIONS = PERMISSION_CATEGORIES.flatMap(c => c.permissions);

export default function UsersPage() {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [roles, setRoles] = useState<AccessRole[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingRoleIndex, setEditingRoleIndex] = useState<number | null>(null);
    const [savingMatrix, setSavingMatrix] = useState(false);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [createForm, setCreateForm] = useState({ name: '', email: '', role: 'VIEWER', password: '' });
    const [createError, setCreateError] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetch('/api/admin')
            .then((res) => res.json())
            .then((data) => {
                setUsers(data.users);
                if (data.roles) setRoles(data.roles);
            })
            .finally(() => setLoading(false));
    }, []);

    const saveRoleMatrix = async (updatedRoles: AccessRole[]) => {
        setSavingMatrix(true);
        try {
            await fetch('/api/admin', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'roles_array', roles: updatedRoles }),
            });
            setRoles(updatedRoles);
            setEditingRoleIndex(null);
        } catch (err) {
            console.error(err);
        } finally {
            setSavingMatrix(false);
        }
    };

    const togglePermission = (roleIdx: number, perm: Permission) => {
        if (roleIdx !== editingRoleIndex) return;
        const target = { ...roles[roleIdx] };
        if (target.isSystem && target.id === 'ADMIN') return;

        if (target.permissions.includes(perm)) {
            target.permissions = target.permissions.filter(p => p !== perm);
        } else {
            target.permissions = [...target.permissions, perm];
        }

        const freshArr = [...roles];
        freshArr[roleIdx] = target;
        setRoles(freshArr);
    };

    const updateRoleName = (roleIdx: number, newName: string) => {
        const freshArr = [...roles];
        freshArr[roleIdx] = { ...freshArr[roleIdx], name: newName };
        setRoles(freshArr);
    };

    const spawnBlankRole = () => {
        const generatedId = `ROLE_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const freshArr: AccessRole[] = [...roles, {
            id: generatedId,
            name: 'New Role',
            isSystem: false,
            permissions: ['VIEW_DASHBOARD', 'VIEW_REPORTS', 'VIEW_PROJECTS', 'VIEW_TICKETS']
        }];
        setRoles(freshArr);
        setEditingRoleIndex(freshArr.length - 1);
    };

    const eradicateRole = (idx: number) => {
        const freshArr = [...roles];
        freshArr.splice(idx, 1);
        setRoles(freshArr);
        setEditingRoleIndex(null);
    };

    const toggleUserRole = async (user: AppUser, targetRoleId: string) => {
        await fetch('/api/admin', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'user_role', id: user.id, role: targetRoleId }),
        });
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: targetRoleId } : u));
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError('');
        setCreating(true);

        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createForm),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to create user.');

            setUsers((prev) => [data.user, ...prev]);
            setIsMenuOpen(false);
            setCreateForm({ name: '', email: '', role: roles[1]?.id || 'VIEWER', password: '' });
        } catch (err: any) {
            setCreateError(err.message);
        } finally {
            setCreating(false);
        }
    };

    const toggleCategoryAll = (roleIdx: number, cat: PermissionCategory, currentlyAllOn: boolean) => {
        if (roleIdx !== editingRoleIndex) return;
        const target = { ...roles[roleIdx] };
        if (target.isSystem && target.id === 'ADMIN') return;

        const catKeys = cat.permissions.map(p => p.key);
        if (currentlyAllOn) {
            target.permissions = target.permissions.filter(p => !catKeys.includes(p));
        } else {
            const missing = catKeys.filter(k => !target.permissions.includes(k));
            target.permissions = [...target.permissions, ...missing];
        }

        const freshArr = [...roles];
        freshArr[roleIdx] = target;
        setRoles(freshArr);
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
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <Link href="/admin" className="text-sm font-semibold flex items-center gap-2 mb-4 hover:underline" style={{ color: '#4141A2', width: 'max-content' }}>
                        <ArrowLeft className="w-4 h-4" /> Back to Admin Portal
                    </Link>
                    <h1 className="section-header">User Management & Permissions</h1>
                    <p className="section-subtext">Access control ledger governing application privileges and explicit role checklists.</p>
                </div>
                <button 
                    onClick={() => {
                        setCreateForm(prev => ({ ...prev, role: roles[1]?.id || 'VIEWER' }));
                        setIsMenuOpen(true);
                    }}
                    className="btn-accent text-sm tracking-wide"
                >
                    <Plus className="w-4 h-4" /> Provision User
                </button>
            </div>

            {/* ──────────────────────────────────────────────────────────────────── */}
            {/* Permissions Matrix Table                                            */}
            {/* ──────────────────────────────────────────────────────────────────── */}
            <div className="mb-10">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[13px] font-black uppercase tracking-widest" style={{ color: '#3F4450' }}>Permissions Matrix</h2>
                    <button 
                        onClick={spawnBlankRole}
                        className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-md hover:bg-[#F9FAFB] border border-transparent hover:border-[#E2E4E9]"
                        style={{ color: '#4141A2' }}
                    >
                        <PlusCircle className="w-3.5 h-3.5" /> Add Role
                    </button>
                </div>

                <div className="glass-card overflow-hidden">
                    <div style={{ overflowX: 'auto' }}>
                        <table className="w-full border-collapse text-[12px]" style={{ minWidth: 500 + roles.length * 140 }}>
                            <thead>
                                {/* Role header row */}
                                <tr style={{ borderBottom: '2px solid #E2E4E9' }}>
                                    <th 
                                        className="sticky left-0 z-10 px-5 py-4 text-left"
                                        style={{ background: '#FFFFFF', minWidth: 300 }}
                                    >
                                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#A4A9B6' }}>Permission</span>
                                    </th>
                                    {roles.map((role, idx) => {
                                        const isEditing = editingRoleIndex === idx;
                                        const isSuperAdmin = role.isSystem && role.id === 'ADMIN';

                                        return (
                                            <th 
                                                key={role.id} 
                                                className="px-3 py-4 text-center"
                                                style={{ 
                                                    minWidth: 140,
                                                    background: isEditing ? '#F5F3FF' : '#FFFFFF',
                                                    borderLeft: '1px solid #E2E4E9',
                                                }}
                                            >
                                                <div className="flex flex-col items-center gap-1.5">
                                                    {isEditing && !role.isSystem ? (
                                                        <input 
                                                            type="text" 
                                                            value={role.name}
                                                            onChange={e => updateRoleName(idx, e.target.value)}
                                                            className="form-input text-[11px] font-bold uppercase tracking-wider h-7 px-2 text-center"
                                                            style={{ width: 120 }}
                                                        />
                                                    ) : (
                                                        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: '#3F4450' }}>
                                                            {role.name}
                                                        </span>
                                                    )}
                                                    <div className="flex items-center gap-1.5">
                                                        {role.isSystem && (
                                                            <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm" style={{ background: '#EEF2FF', color: '#4141A2' }}>
                                                                System
                                                            </span>
                                                        )}
                                                        {isSuperAdmin && (
                                                            <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm" style={{ background: '#FFF5F5', color: '#FA4338' }}>
                                                                Full Access
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Edit / Save / Delete controls */}
                                                    <div className="flex items-center gap-1 mt-1">
                                                        {isEditing ? (
                                                            <>
                                                                <button
                                                                    onClick={() => saveRoleMatrix(roles)}
                                                                    disabled={savingMatrix}
                                                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all"
                                                                    style={{ background: '#4141A2', color: '#fff' }}
                                                                >
                                                                    <Save className="w-3 h-3" />
                                                                    {savingMatrix ? '...' : 'Save'}
                                                                </button>
                                                                {!role.isSystem && (
                                                                    <button
                                                                        onClick={() => eradicateRole(idx)}
                                                                        className="flex items-center justify-center w-6 h-6 rounded-md transition-colors hover:bg-red-50"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" style={{ color: '#FA4338' }} />
                                                                    </button>
                                                                )}
                                                            </>
                                                        ) : (
                                                            !isSuperAdmin && (
                                                                <button
                                                                    onClick={() => setEditingRoleIndex(idx)}
                                                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-[#F6F6F9]"
                                                                    style={{ color: '#717684', border: '1px solid #E2E4E9' }}
                                                                >
                                                                    <Pencil className="w-3 h-3" /> Edit
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {PERMISSION_CATEGORIES.map((cat) => {
                                    return (
                                        <>
                                            {/* Category header row */}
                                            <tr key={`cat-${cat.category}`} style={{ background: '#F6F6F9' }}>
                                                <td
                                                    className="sticky left-0 z-10 px-5 py-2.5"
                                                    style={{ background: '#F6F6F9' }}
                                                >
                                                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#4141A2' }}>
                                                        {cat.category}
                                                    </span>
                                                </td>
                                                {roles.map((role, rIdx) => {
                                                    const isEditing = editingRoleIndex === rIdx;
                                                    const isSuperAdmin = role.isSystem && role.id === 'ADMIN';
                                                    const allOn = cat.permissions.every(p => role.permissions.includes(p.key));
                                                    const someOn = cat.permissions.some(p => role.permissions.includes(p.key));
                                                    
                                                    return (
                                                        <td 
                                                            key={`cat-${cat.category}-${role.id}`} 
                                                            className="px-3 py-2.5 text-center"
                                                            style={{ 
                                                                background: '#F6F6F9',
                                                                borderLeft: '1px solid #E2E4E9',
                                                            }}
                                                        >
                                                            {isEditing && !isSuperAdmin ? (
                                                                <button
                                                                    onClick={() => toggleCategoryAll(rIdx, cat, allOn)}
                                                                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-colors"
                                                                    style={{ 
                                                                        background: allOn ? '#EBF5EF' : someOn ? '#FEF9ED' : '#F0F0F5',
                                                                        color: allOn ? '#21944E' : someOn ? '#D3A236' : '#A4A9B6',
                                                                    }}
                                                                >
                                                                    {allOn ? 'All' : someOn ? 'Some' : 'None'}
                                                                </button>
                                                            ) : (
                                                                <span 
                                                                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                                                                    style={{ 
                                                                        background: allOn ? '#EBF5EF' : someOn ? '#FEF9ED' : '#F0F0F5',
                                                                        color: allOn ? '#21944E' : someOn ? '#D3A236' : '#A4A9B6',
                                                                    }}
                                                                >
                                                                    {allOn ? 'All' : someOn ? 'Some' : 'None'}
                                                                </span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>

                                            {/* Individual permission rows */}
                                            {cat.permissions.map((perm) => (
                                                <tr 
                                                    key={perm.key}
                                                    className="transition-colors"
                                                    style={{ borderBottom: '1px solid #F0F1F3' }}
                                                >
                                                    <td 
                                                        className="sticky left-0 z-10 px-5 py-2.5"
                                                        style={{ background: '#FFFFFF' }}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[12px] font-medium" style={{ color: '#3F4450' }}>
                                                                {perm.label}
                                                            </span>
                                                            {perm.confidential && (
                                                                <Lock className="w-3 h-3 flex-shrink-0" style={{ color: '#FA4338' }} />
                                                            )}
                                                        </div>
                                                    </td>
                                                    {roles.map((role, rIdx) => {
                                                        const hasPerm = role.permissions.includes(perm.key);
                                                        const isEditing = editingRoleIndex === rIdx;
                                                        const isSuperAdmin = role.isSystem && role.id === 'ADMIN';
                                                        const canToggle = isEditing && !isSuperAdmin;

                                                        return (
                                                            <td 
                                                                key={`${perm.key}-${role.id}`}
                                                                className="px-3 py-2.5 text-center"
                                                                style={{ 
                                                                    borderLeft: '1px solid #E2E4E9',
                                                                    background: isEditing ? '#FAFAFE' : '#FFFFFF',
                                                                }}
                                                            >
                                                                <button
                                                                    onClick={() => canToggle && togglePermission(rIdx, perm.key)}
                                                                    disabled={!canToggle}
                                                                    className="inline-flex items-center justify-center w-6 h-6 rounded-md transition-all"
                                                                    style={{
                                                                        background: hasPerm ? '#4141A2' : canToggle ? '#F0F0F5' : '#F6F6F9',
                                                                        cursor: canToggle ? 'pointer' : 'default',
                                                                        border: canToggle && !hasPerm ? '1.5px solid #D0D2D8' : 'none',
                                                                        opacity: isSuperAdmin ? 1 : undefined,
                                                                    }}
                                                                >
                                                                    {hasPerm && (
                                                                        <Check className="w-3.5 h-3.5" style={{ color: '#FFFFFF' }} />
                                                                    )}
                                                                </button>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ──────────────────────────────────────────────────────────────────── */}
            {/* Active Users Table                                                  */}
            {/* ──────────────────────────────────────────────────────────────────── */}
            <div className="glass-card p-0 overflow-hidden">
                <div className="p-8 border-b border-[#E2E4E9]">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#F5F3FF' }}>
                            <Users className="w-6 h-6" style={{ color: '#4141A2' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: '#3F4450' }}>Active Users</h2>
                            <p className="text-xs font-semibold" style={{ color: '#A4A9B6' }}>{users.length} users provisioned across {roles.length} roles</p>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto p-4">
                    <table className="data-table w-full mb-2">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: '20px' }}>Name</th>
                                <th>Email</th>
                                <th>Joined</th>
                                <th style={{ textAlign: 'right', paddingRight: '20px' }}>Role</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => {
                                const validRoleTarget = roles.find(r => r.id === user.role) || { name: 'Unknown', isSystem: false, permissions: [] };

                                return (
                                    <tr key={user.id} className="hover:bg-[#F9FAFB]/50 transition-colors">
                                        <td className="text-[14px] font-black" style={{ color: '#3F4450', paddingLeft: '20px' }}>{user.name}</td>
                                        <td className="text-[13px] font-medium" style={{ color: '#717684' }}>{user.email}</td>
                                        <td className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#A4A9B6' }}>
                                            {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                                        </td>
                                        <td style={{ textAlign: 'right', paddingRight: '20px' }}>
                                            <select 
                                                value={user.role}
                                                onChange={(e) => toggleUserRole(user, e.target.value)}
                                                className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all cursor-pointer outline-none bg-white"
                                                style={{
                                                    borderColor: validRoleTarget.permissions.length > 10 ? 'rgba(65,65,162,0.3)' : '#E2E4E9',
                                                    color: validRoleTarget.permissions.length > 10 ? '#4141A2' : '#717684'
                                                }}
                                            >
                                                {roles.map(r => (
                                                    <option key={r.id} value={r.id}>{r.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ──────────────────────────────────────────────────────────────────── */}
            {/* Create User Modal                                                   */}
            {/* ──────────────────────────────────────────────────────────────────── */}
            {isMenuOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#3F4450]/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
                    <div className="glass-card relative w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200" style={{ background: '#FFFFFF', border: '1px solid #E2E4E9', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-black tracking-tight" style={{ color: '#3F4450' }}>Create User</h2>
                            <button onClick={() => setIsMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E2E4E9] hover:bg-[#F9FAFB] transition-colors">
                                <X className="w-4 h-4" style={{ color: '#A4A9B6' }} />
                            </button>
                        </div>
                        
                        {createError && (
                            <div className="mb-6 p-4 rounded-xl text-sm font-semibold flex items-start gap-2 border border-red-100" style={{ color: '#FA4338', background: '#FFF4ED' }}>
                                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                                {createError}
                            </div>
                        )}

                        <form onSubmit={handleCreateUser} className="space-y-5">
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: '#717684' }}>Name</label>
                                <input 
                                    type="text" 
                                    required 
                                    className="form-input text-sm font-semibold w-full" 
                                    placeholder="Full name"
                                    value={createForm.name} 
                                    onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))} 
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: '#717684' }}>Email</label>
                                <input 
                                    type="email" 
                                    required 
                                    className="form-input text-sm font-semibold w-full" 
                                    placeholder="email@example.com"
                                    value={createForm.email} 
                                    onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))} 
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: '#717684' }}>Password <span className="normal-case font-semibold" style={{ color: '#A4A9B6' }}>(optional)</span></label>
                                    <input 
                                        type="text" 
                                        className="form-input text-[13px] font-bold tracking-widest w-full font-mono" 
                                        placeholder="Leave blank for Google SSO"
                                        value={createForm.password} 
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))} 
                                    />
                                    <p className="text-[10px] mt-1.5" style={{ color: '#A4A9B6' }}>Google OAuth users don&apos;t need a password</p>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: '#717684' }}>Role</label>
                                    <select 
                                        className="form-input text-sm font-bold w-full uppercase" 
                                        value={createForm.role} 
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, role: e.target.value }))}
                                    >
                                        {roles.map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="pt-6 border-t mt-8" style={{ borderColor: '#E2E4E9' }}>
                                <button 
                                    disabled={creating}
                                    type="submit" 
                                    className="w-full h-11 rounded-xl text-sm font-black uppercase tracking-wider transition-all"
                                    style={{ 
                                        background: creating ? '#E2E4E9' : '#4141A2', 
                                        color: creating ? '#A4A9B6' : '#FFFFFF',
                                    }}
                                >
                                    {creating ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
