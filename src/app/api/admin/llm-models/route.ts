import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Curated latest Claude models (Anthropic has no public /models endpoint)
const ANTHROPIC_MODELS = [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-0',
    'claude-sonnet-4-0',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
];

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
    const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const data = await res.json();

    // Filter to chat-capable GPT and o-series models, sorted newest first
    const chatPrefixes = ['gpt-4o', 'gpt-4', 'o1', 'o3', 'o4', 'chatgpt'];
    const models: string[] = (data.data ?? [])
        .map((m: { id: string }) => m.id)
        .filter((id: string) =>
            chatPrefixes.some(p => id.startsWith(p)) &&
            !id.includes('instruct') &&
            !id.includes('search') &&
            !id.includes('realtime') &&
            !id.includes('audio') &&
            !id.includes('tts') &&
            !id.includes('whisper') &&
            !id.includes('dall-e') &&
            !id.includes('embedding')
        )
        .sort((a: string, b: string) => b.localeCompare(a));

    return models.length ? models : ['gpt-4o'];
}

async function fetchGeminiModels(apiKey: string): Promise<string[]> {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`,
        { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = await res.json();

    const models: string[] = (data.models ?? [])
        .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
            (m.supportedGenerationMethods ?? []).includes('generateContent') &&
            (m.name.includes('gemini') || m.name.includes('gemma'))
        )
        .map((m: { name: string }) => m.name.replace('models/', ''))
        .filter((id: string) =>
            !id.includes('vision') &&
            !id.includes('embedding') &&
            !id.includes('aqa') &&
            !id.includes('001')
        )
        .sort((a: string, b: string) => b.localeCompare(a));

    return models.length ? models : ['gemini-1.5-pro'];
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { provider, apiKey } = await req.json();
    if (!provider || !apiKey) {
        return NextResponse.json({ error: 'provider and apiKey are required' }, { status: 400 });
    }

    try {
        let models: string[];
        if (provider === 'openai') {
            models = await fetchOpenAIModels(apiKey);
        } else if (provider === 'anthropic') {
            // Anthropic has no public /models endpoint — return curated list
            models = ANTHROPIC_MODELS;
        } else if (provider === 'gemini') {
            models = await fetchGeminiModels(apiKey);
        } else {
            return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
        }

        return NextResponse.json({ models });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch models';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
