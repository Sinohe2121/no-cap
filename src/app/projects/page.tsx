'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderKanban, ArrowRight, ChevronDown, Ticket } from 'lucide-react';

interface Project {
    id: string;
    name: string;
    description: string;
    epicKey: string;
    status: string;
    isCapitalizable: boolean;
    totalCost: number;
    accumulatedCost: number;
    startingBalance: number;
    startDate: string;
    launchDate: string | null;
    overrideReason: string | null;
    ticketCount: number;
    storyPoints: number;
    bugPoints: number;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function statusBadge(status: string) {
    const colors: Record<string, string> = {
        PLANNING: 'border-[#D3D236] text-[#3F4450]',
        DEV: 'border-[#4141A2] text-[#4141A2]',
        LIVE: 'border-[#21944E] text-[#21944E]',
        RETIRED: 'border-[#A4A9B6] text-[#717684]',
    };
    return `badge border bg-white ${colors[status] || colors.RETIRED}`;
}

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/projects')
            .then((res) => res.json())
            .then(setProjects)
            .finally(() => setLoading(false));
    }, []);

    const toggleCapitalizable = async (project: Project) => {
        const updated = !project.isCapitalizable;
        await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: project.id, isCapitalizable: updated }),
        });
        setProjects((prev) =>
            prev.map((p) => (p.id === project.id ? { ...p, isCapitalizable: updated } : p))
        );
    };

    const updateStatus = async (project: Project, status: string) => {
        await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: project.id, status }),
        });
        setProjects((prev) =>
            prev.map((p) => (p.id === project.id ? { ...p, status } : p))
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FA4338', borderTopColor: 'transparent' }} />
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-header">Projects</h1>
                    <p className="section-subtext">Manage software assets and capitalization status</p>
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: '#A4A9B6' }}>
                    <FolderKanban className="w-4 h-4" />
                    <span>{projects.length} projects</span>
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Epic</th>
                            <th>Status</th>
                            <th>Treatment</th>
                            <th className="text-right">YTD Cost</th>
                            <th className="text-right">ITD Cost</th>
                            <th className="text-right">Tickets</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.map((project) => (
                            <tr key={project.id}>
                                <td>
                                    <div>
                                        <p className="text-sm font-semibold" style={{ color: '#3F4450' }}>{project.name}</p>
                                        <p className="text-xs mt-0.5" style={{ color: '#A4A9B6' }}>{project.description}</p>
                                    </div>
                                </td>
                                <td>
                                    <span className="text-xs font-mono" style={{ color: '#4141A2' }}>{project.epicKey}</span>
                                </td>
                                <td>
                                    <div className="relative group">
                                        <button className={`${statusBadge(project.status)} cursor-pointer flex items-center gap-1`}>
                                            {project.status}
                                            <ChevronDown className="w-3 h-3" />
                                        </button>
                                        <div className="absolute top-full left-0 mt-1 border rounded-lg p-1 hidden group-hover:block z-10 min-w-[120px]" style={{ background: '#FFFFFF', borderColor: '#E2E4E9' }}>
                                            {['PLANNING', 'DEV', 'LIVE', 'RETIRED'].map((s) => (
                                                <button
                                                    key={s}
                                                    onClick={() => updateStatus(project, s)}
                                                    className="block w-full text-left px-3 py-1.5 text-xs rounded"
                                                    style={{ color: '#3F4450' }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F6F9')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <button
                                        onClick={() => toggleCapitalizable(project)}
                                        className={`toggle-switch ${project.isCapitalizable ? 'active' : ''}`}
                                        title={project.isCapitalizable ? 'Capitalize' : 'Expense'}
                                    />
                                    <span className="text-[10px] ml-2 uppercase font-semibold" style={{ color: '#A4A9B6' }}>
                                        {project.isCapitalizable ? 'Cap' : 'Exp'}
                                    </span>
                                </td>
                                <td className="text-right">
                                    <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>{formatCurrency(project.accumulatedCost)}</span>
                                </td>
                                <td className="text-right">
                                    <span className="text-sm font-semibold" style={{ color: '#3F4450' }}>{formatCurrency(project.totalCost)}</span>
                                </td>
                                <td className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <span className="badge text-[10px]" style={{ background: '#EBF5EF', color: '#21944E' }}>{project.storyPoints} SP</span>
                                        <span className="badge text-[10px]" style={{ background: '#FFF5F5', color: '#FA4338' }}>{project.bugPoints} bugs</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <Link href={`/projects/${project.id}/tickets`} className="btn-ghost text-xs">
                                            <Ticket className="w-3 h-3" /> Tickets
                                        </Link>
                                        <Link href={`/projects/${project.id}`} className="btn-ghost text-xs">
                                            Details <ArrowRight className="w-3 h-3" />
                                        </Link>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
