import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function maskKey(key: string): string {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const config = await db.llmConfig.findUnique({ where: { id: 'singleton' } });
        if (!config) {
            return NextResponse.json({ configured: false });
        }
        return NextResponse.json({
            configured: true,
            provider: config.provider,
            model: config.model,
            maskedKey: maskKey(config.apiKey),
            customSystemPrompt: config.customSystemPrompt ?? null,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { provider, apiKey, model, customSystemPrompt } = body;

        // If only updating the prompt (no new key)
        if (!provider && !apiKey && customSystemPrompt !== undefined) {
            const config = await db.llmConfig.update({
                where: { id: 'singleton' },
                data: { customSystemPrompt: customSystemPrompt ?? null },
            });
            return NextResponse.json({
                configured: true,
                provider: config.provider,
                model: config.model,
                maskedKey: maskKey(config.apiKey),
                customSystemPrompt: config.customSystemPrompt ?? null,
            });
        }

        if (!provider || !apiKey) {
            return NextResponse.json({ error: 'provider and apiKey are required' }, { status: 400 });
        }

        const config = await db.llmConfig.upsert({
            where: { id: 'singleton' },
            update: {
                provider,
                apiKey,
                model: model || null,
                ...(customSystemPrompt !== undefined && { customSystemPrompt: customSystemPrompt ?? null }),
            },
            create: {
                id: 'singleton',
                provider,
                apiKey,
                model: model || null,
                customSystemPrompt: customSystemPrompt ?? null,
            },
        });

        return NextResponse.json({
            configured: true,
            provider: config.provider,
            model: config.model,
            maskedKey: maskKey(config.apiKey),
            customSystemPrompt: config.customSystemPrompt ?? null,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function DELETE() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        await db.llmConfig.deleteMany({ where: { id: 'singleton' } });
        return NextResponse.json({ configured: false });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
