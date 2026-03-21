import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CreateEvidenceSchema, UpdateEvidenceSchema, DeleteByIdSchema, formatZodError } from '@/lib/validations';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const controlId = searchParams.get('controlId');
    if (!controlId) return NextResponse.json({ error: 'controlId required' }, { status: 400 });

    const evidence = await prisma.soc2Evidence.findMany({
        where: { controlId },
        orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ evidence });
}

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = CreateEvidenceSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { controlId, title, description, url, reviewer } = parsed.data;
        const ev = await prisma.soc2Evidence.create({
            data: { controlId, title, description: description || '', url: url || '', reviewer: reviewer || '' },
        });
        return NextResponse.json(ev, { status: 201 });
    } catch (e) {
        console.error('SOC2 evidence create error:', e);
        return NextResponse.json({ error: 'Failed to create evidence' }, { status: 400 });
    }
}

export async function PATCH(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = UpdateEvidenceSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { id, title, description, url, reviewer, isVerified, reviewedAt } = parsed.data;

        const data: Record<string, unknown> = {};
        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (url !== undefined) data.url = url;
        if (reviewer !== undefined) data.reviewer = reviewer;
        if (isVerified !== undefined) {
            data.isVerified = isVerified;
            if (isVerified && !reviewedAt) data.reviewedAt = new Date();
        }
        if (reviewedAt !== undefined) data.reviewedAt = new Date(reviewedAt);

        const updated = await prisma.soc2Evidence.update({ where: { id }, data });
        return NextResponse.json(updated);
    } catch (e) {
        console.error('SOC2 evidence update error:', e);
        return NextResponse.json({ error: 'Failed to update evidence' }, { status: 400 });
    }
}

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
        await prisma.soc2Evidence.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('SOC2 evidence delete error:', e);
        return NextResponse.json({ error: 'Failed to delete evidence' }, { status: 400 });
    }
}
