export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const PROVIDER_DEFAULTS: Record<string, string> = {
    openai:    'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    gemini:    'gemini-1.5-pro',
};

// ─── LLM caller (identical to memos/generate pattern) ────────────────────────
async function callLlm(provider: string, apiKey: string, model: string, prompt: string): Promise<string> {
    if (provider === 'openai') {
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({ apiKey });
        const res = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4000,
        });
        return res.choices[0]?.message?.content ?? '';
    }

    if (provider === 'anthropic') {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey });
        const res = await client.messages.create({
            model,
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }],
        });
        const block = res.content[0];
        return block.type === 'text' ? block.text : '';
    }

    if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model });
        const res = await geminiModel.generateContent(prompt);
        return res.response.text();
    }

    throw new Error(`Unknown provider: ${provider}`);
}

// ─── Build the analysis prompt ────────────────────────────────────────────────
function buildFluxPrompt(
    labelA: string,
    labelB: string,
    periodA: any,
    periodB: any,
    userPrompt: string,
): string {
    const fmt  = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    const pct  = (a: number, b: number) => a === 0 ? '(no prior period)' : `${(((b - a) / a) * 100).toFixed(1)}% ${b >= a ? '▲' : '▼'}`;
    const row  = (label: string, a: number, b: number, fmtFn: (v: number) => string = v => String(v)) => `| ${label} | ${fmtFn(a)} | ${fmtFn(b)} | ${pct(a, b)} |`;

    const summaryTable = `
## Summary KPIs
| Metric | ${labelA} | ${labelB} | Change |
|:-------|----------:|----------:|-------:|
${row('Total Tickets Closed', periodA.totalTickets, periodB.totalTickets)}
${row('Total Story Points', periodA.totalSP, periodB.totalSP)}
${row('Feature Story Points', periodA.featureSP, periodB.featureSP)}
${row('Bug SP', periodA.bugSP, periodB.bugSP)}
${row('Bug Cost', periodA.bugCost, periodB.bugCost, fmt)}
${row('Task Cost', periodA.taskCost, periodB.taskCost, fmt)}
${row('Cap Ratio', periodA.capRatio, periodB.capRatio, v => `${v}%`)}
${row('Bug Ratio', periodA.bugRatio, periodB.bugRatio, v => `${v}%`)}
${row('Avg Cycle Time (days)', periodA.avgCycleTime, periodB.avgCycleTime)}
${row('Active Developers (tickets)', periodA.activeDevs, periodB.activeDevs)}
${row('Payroll Headcount', periodA.headcount, periodB.headcount)}
${row('Total Payroll Cost', periodA.totalPayroll, periodB.totalPayroll, fmt)}
${row('Capitalized (Journal Entry)', periodA.totalCapitalized, periodB.totalCapitalized, fmt)}
${row('Expensed (Journal Entry)', periodA.totalExpensed, periodB.totalExpensed, fmt)}
${row('Amortized', periodA.totalAmortized, periodB.totalAmortized, fmt)}
${row('Total Allocated', periodA.totalAllocated, periodB.totalAllocated, fmt)}
${row('Cost per Ticket', periodA.costPerTicket, periodB.costPerTicket, fmt)}
${row('Cost per SP', periodA.costPerSP, periodB.costPerSP, fmt)}
`;

    const projectTableA = periodA.projectBreakdown.length
        ? `\n## Capitalized Projects — ${labelA}\n| Project | Status | Cap SP | Cost |\n|:--------|:-------|-------:|-----:|\n` +
          periodA.projectBreakdown.map((p: any) => `| ${p.name} | ${p.status} | ${p.capSP} | ${fmt(p.totalCost)} |`).join('\n')
        : `\n_(No capitalized project activity in ${labelA})_`;

    const projectTableB = periodB.projectBreakdown.length
        ? `\n## Capitalized Projects — ${labelB}\n| Project | Status | Cap SP | Cost |\n|:--------|:-------|-------:|-----:|\n` +
          periodB.projectBreakdown.map((p: any) => `| ${p.name} | ${p.status} | ${p.capSP} | ${fmt(p.totalCost)} |`).join('\n')
        : `\n_(No capitalized project activity in ${labelB})_`;

    const topDevsSection = (label: string, devs: any[]) =>
        devs.length
            ? `\n## Top Developers by Ticket Volume — ${label}\n| Developer | Tickets |\n|:----------|--------:|\n` +
              devs.map(d => `| ${d.name} | ${d.count} |`).join('\n')
            : '';

    const amortSection = (label: string, items: any[]) =>
        items.length
            ? `\n## Amortization Detail — ${label}\n| Project | Charge |\n|:--------|-------:|\n` +
              items.map(a => `| ${a.projectName} | ${fmt(a.charge)} |`).join('\n')
            : '';

    const dataContext = [
        summaryTable,
        projectTableA,
        projectTableB,
        topDevsSection(labelA, periodA.topDevs),
        topDevsSection(labelB, periodB.topDevs),
        amortSection(labelA, periodA.amortByProject),
        amortSection(labelB, periodB.amortByProject),
    ].join('\n');

    return `${userPrompt}

---

## FINANCIAL DATA FOR FLUX ANALYSIS

Comparing **${labelA}** (Period A) vs **${labelB}** (Period B).

${dataContext}`;
}

// ─── Route ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { comparisonData, prompt, labelA, labelB } = await req.json();

    if (!comparisonData || !prompt) {
        return NextResponse.json({ error: 'comparisonData and prompt are required' }, { status: 400 });
    }

    const llmConfig = await db.llmConfig.findUnique({ where: { id: 'singleton' } });
    if (!llmConfig) {
        return NextResponse.json(
            { error: 'No LLM provider configured. Go to Admin → AI Configuration.' },
            { status: 400 }
        );
    }
    const model: string = llmConfig.model || PROVIDER_DEFAULTS[llmConfig.provider as string] || 'gpt-4o';

    const fullPrompt = buildFluxPrompt(
        labelA || 'Period A',
        labelB || 'Period B',
        comparisonData.periodA,
        comparisonData.periodB,
        prompt,
    );

    let commentary: string;
    try {
        commentary = await callLlm(llmConfig.provider as string, llmConfig.apiKey as string, model, fullPrompt);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: `LLM error: ${msg}` }, { status: 500 });
    }

    if (!commentary || commentary.trim().length < 50) {
        return NextResponse.json(
            { error: 'The LLM returned an empty response. Try a shorter date range or check your AI configuration.' },
            { status: 500 }
        );
    }

    return NextResponse.json({ commentary });
}
