import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { AddGitHubRepoSchema, DeleteByIdSchema, PatchGitHubRepoSchema, formatZodError } from '@/lib/validations';

// GET — list all connected repos with project mappings
export async function GET() {
    try {
        const repos = await prisma.gitHubRepo.findMany({
            orderBy: { createdAt: 'desc' },
        });
        const projects = await prisma.project.findMany({
            where: { isCapitalizable: true },
            select: { id: true, name: true, epicKey: true, status: true },
            orderBy: { name: 'asc' },
        });
        return NextResponse.json({ repos, projects });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to load repos' }, { status: 500 });
    }
}

// POST — add a repo connection (body: { owner, name, projectId? })
export async function POST(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = AddGitHubRepoSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { owner, name, projectId } = parsed.data;
        const repo = await prisma.gitHubRepo.upsert({
            where: { owner_name: { owner: owner.trim(), name: name.trim() } },
            create: { owner: owner.trim(), name: name.trim(), projectId: projectId || null },
            update: { projectId: projectId || null, isActive: true },
        });
        return NextResponse.json(repo, { status: 201 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to add repo' }, { status: 500 });
    }
}

// DELETE — remove a repo (body: { id })
export async function DELETE(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = DeleteByIdSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { id } = parsed.data;
        await prisma.gitHubRepo.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to remove repo' }, { status: 500 });
    }
}

// PATCH — update projectId mapping for a repo
export async function PATCH(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = PatchGitHubRepoSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { id, projectId } = parsed.data;
        const repo = await prisma.gitHubRepo.update({
            where: { id },
            data: { projectId: projectId || null },
        });
        return NextResponse.json(repo);
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to update repo' }, { status: 500 });
    }
}
