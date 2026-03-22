export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CreateRiskSchema, UpdateRiskSchema, DeleteByIdSchema, formatZodError } from '@/lib/validations';

export async function GET() {
    const risks = await prisma.soc2RiskItem.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ risks });
}

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = CreateRiskSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { title, likelihood, impact, mitigation, status } = parsed.data;
        const risk = await prisma.soc2RiskItem.create({
            data: { title, likelihood: likelihood || 'LOW', impact: impact || 'LOW', mitigation: mitigation || '', status: status || 'OPEN' },
        });
        return NextResponse.json(risk, { status: 201 });
    } catch (e) {
        console.error('SOC2 risk create error:', e);
        return NextResponse.json({ error: 'Failed to create risk' }, { status: 400 });
    }
}

export async function PATCH(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const raw = await req.json();
        const parsed = UpdateRiskSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { id, title, likelihood, impact, mitigation, status } = parsed.data;

        const data: Record<string, unknown> = {};
        if (title !== undefined) data.title = title;
        if (likelihood !== undefined) data.likelihood = likelihood;
        if (impact !== undefined) data.impact = impact;
        if (mitigation !== undefined) data.mitigation = mitigation;
        if (status !== undefined) data.status = status;

        const updated = await prisma.soc2RiskItem.update({ where: { id }, data });
        return NextResponse.json(updated);
    } catch (e) {
        console.error('SOC2 risk update error:', e);
        return NextResponse.json({ error: 'Failed to update risk' }, { status: 400 });
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
        await prisma.soc2RiskItem.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('SOC2 risk delete error:', e);
        return NextResponse.json({ error: 'Failed to delete risk' }, { status: 400 });
    }
}
