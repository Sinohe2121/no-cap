export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CreateIncidentSchema, UpdateIncidentSchema, DeleteByIdSchema, formatZodError } from '@/lib/validations';

export async function GET() {
    const incidents = await prisma.soc2IncidentLog.findMany({ orderBy: { occurredAt: 'desc' } });
    return NextResponse.json({ incidents });
}

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = CreateIncidentSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { title, severity, description, occurredAt, isResolved, resolvedAt } = parsed.data;
        const incident = await prisma.soc2IncidentLog.create({
            data: { title, severity, description: description || '', occurredAt: occurredAt ? new Date(occurredAt) : new Date(), isResolved: isResolved || false, resolvedAt: resolvedAt ? new Date(resolvedAt) : null },
        });
        return NextResponse.json(incident, { status: 201 });
    } catch (e) {
        console.error('SOC2 incident create error:', e);
        return NextResponse.json({ error: 'Failed to create incident' }, { status: 400 });
    }
}

export async function PATCH(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = UpdateIncidentSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { id, title, severity, description, occurredAt, isResolved, resolvedAt } = parsed.data;

        const data: Record<string, unknown> = {};
        if (title !== undefined) data.title = title;
        if (severity !== undefined) data.severity = severity;
        if (description !== undefined) data.description = description;
        if (occurredAt !== undefined) data.occurredAt = new Date(occurredAt);
        if (isResolved !== undefined) {
            data.isResolved = isResolved;
            if (isResolved && !resolvedAt) data.resolvedAt = new Date();
        }
        if (resolvedAt !== undefined) data.resolvedAt = new Date(resolvedAt);

        const updated = await prisma.soc2IncidentLog.update({ where: { id }, data });
        return NextResponse.json(updated);
    } catch (e) {
        console.error('SOC2 incident update error:', e);
        return NextResponse.json({ error: 'Failed to update incident' }, { status: 400 });
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
        await prisma.soc2IncidentLog.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('SOC2 incident delete error:', e);
        return NextResponse.json({ error: 'Failed to delete incident' }, { status: 400 });
    }
}
