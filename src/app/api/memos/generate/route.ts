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

// ─── App deep-links for table sections ───────────────────────────────────────
const SECTION_LINKS: { pattern: RegExp; url: string }[] = [
    { pattern: /project summary/i,     url: '/accounting/financial-reporting' },
    { pattern: /payroll summary/i,      url: '/accounting/financial-reporting' },
    { pattern: /developer summary/i,    url: '/accounting/financial-reporting' },
    { pattern: /qre/i,                  url: '/rd-credit' },
    { pattern: /amortization schedule/i, url: '/accounting/financial-reporting' },
];

// ─── File extraction ─────────────────────────────────────────────────────────
async function extractTextFromFile(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';

    if (mimeType.includes('pdf') || ext === 'pdf') {
        try {
            // pdf-parse is CommonJS — .default may or may not exist depending on bundler
            const pdfParseModule = await import('pdf-parse');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
            const result = await pdfParse(buffer);
            return result.text.trim();
        } catch {
            return '[PDF could not be parsed]';
        }
    }

    if (
        mimeType.includes('wordprocessingml') ||
        mimeType.includes('msword') ||
        ext === 'docx' || ext === 'doc'
    ) {
        try {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            return result.value.trim();
        } catch {
            return '[DOCX could not be parsed]';
        }
    }

    // Plain text / markdown / anything else
    return buffer.toString('utf-8').trim();
}

// ─── Default system instructions (admin-editable) ────────────────────────────
export const DEFAULT_SYSTEM_INSTRUCTIONS = `**Constraints:**
1. **Technical Framework:** For Capitalization memos, apply **ASC 350-40** (Internal-Use Software). For R&D memos, apply **ASC 730** and IRC §41.
2. **Phase Gate Logic:** For capitalization memos, explicitly evaluate each project against the three stages:
   - *Preliminary Project Stage* — expense all costs
   - *Application Development Stage* — capitalize per ASC 350-40-25-1
   - *Post-Implementation Stage* — expense maintenance, capitalize upgrades only
3. **Data Integrity:** Reproduce ALL dollar amounts, project names, developer names, and quantities from the live financial data exactly as provided. Do not alter, estimate, or round them.
4. **Tone:** Professional, objective, and audit-ready. No conversational filler or wrapper text like "Here is the memo:"
5. **Word Count:** 700–1,000 words. Expand Background & Accounting Policy with detailed GAAP analysis.

**Output Structure** (use exact headers — ## for H2, ### for H3):

## Purpose
State the objective for {{PERIOD_LABEL}} regarding {{MEMO_TYPE}}.

## Background & Accounting Policy
Detailed discussion of Internal-Use Software (ASC 350-40). Define **Capitalizable Costs**, **Service Contracts**, and **Upgrades/Enhancements**. Explain the threshold for capitalization.

### Significant Judgments and Estimates
Detail the key accounting judgments and estimates made this period — auditors look here for the most substantive analysis. Include judgments about stage classification, useful life, and any changes from prior periods.

## Development Phase Criteria
List criteria for capitalization under ASC 350-40-25. Reference where "Probable Future Economic Benefit" is established. Map each active project to its current stage.

## Period Activity — {{PERIOD_LABEL}}

### Project Summary *([View live data in app](/accounting/financial-reporting))*
[Insert Project Summary markdown table from live data — reproduce numbers exactly]

### Payroll Summary *([View live data in app](/accounting/financial-reporting))*
[Insert Payroll Summary markdown table from live data — reproduce numbers exactly]

### Developer/QRE Summary *([View live data in app](/rd-credit))*
[Insert Developer/QRE Summary markdown table from live data — reproduce numbers exactly]

## Amortization Method
Detail the **Straight-Line Method** and the **Useful Life** assumption (typically 3–5 years).

### Amortization Schedule *([View live data in app](/accounting/financial-reporting))*
[Insert Amortization Schedule markdown table from live data — reproduce numbers exactly]

## Management Representations
Include standard representations: (1) data is complete and accurate, (2) no significant changes to project scope since last period, (3) compliance with U.S. GAAP.

## Summary
Final conclusion on the total amount capitalized and/or expensed for {{PERIOD_LABEL}}.

---
**Signature:**
__________________________
Chief Financial Officer / Controller`;

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(
    memoType: string,
    year: number,
    month: number | null,
    data: {
        projects:     { name: string; status: string; allocatedAmount: number }[];
        payroll:      { label: string; grossWages: number; fringeAmount: number; netCost: number }[];
        qre:          { name: string; netAllocatedCost: number }[];
        amortization: { projectName: string; month: number; year: number; charge: number }[];
    },
    sampleDocText: string | null,
    customSystemPrompt: string | null
): string {
    const periodLabel = month
        ? new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
        : `Fiscal Year ${year}`;

    const memoTypeDescriptions: Record<string, string> = {
        CAPITALIZATION:
            "a Capitalized Web Development Policy Memo under ASC 350-40. Document: (1) the company's policy for capitalizing internal-use software costs, (2) development phase criteria, (3) useful life and amortization method, (4) management authorization and probable completion per ASU 2025-06, and (5) a summary of capitalized projects for the period.",
        RD_METHODOLOGY:
            'an R&D Methodology Memo under IRC §41 and ASC 730. Document: (1) the definition of qualified research activities, (2) how developer time is allocated between qualifying vs. non-qualifying work, (3) the wage-based QRE calculation methodology, (4) fringe benefit treatment, and (5) QRE amounts and participating developers for the period.',
        ACCOUNTING_POLICY:
            'a General Accounting Policy Memo covering software cost accounting. Document: (1) the accounting standard applied (ASC 350-40 / IFRS IAS 38), (2) capitalization threshold and criteria, (3) amortization policy, (4) impairment assessment procedures, and (5) period-end balances.',
        CUSTOM:
            'a general-purpose accounting policy memo covering the period\'s key financial data, significant items, trends, and accounting judgments.',
    };

    const description = memoTypeDescriptions[memoType] ?? memoTypeDescriptions.CUSTOM;

    // Build data tables for the prompt
    let dataSection = '';

    if (data.projects.length) {
        dataSection += `\n### Project Summary — ${periodLabel}\n`;
        dataSection += `| Project | Status | Capitalized ($) |\n|:--------|:-------|----------------:|\n`;
        for (const p of data.projects) {
            dataSection += `| ${p.name} | ${p.status} | ${p.allocatedAmount.toFixed(2)} |\n`;
        }
    }

    if (data.payroll.length) {
        dataSection += `\n### Payroll Summary — ${periodLabel}\n`;
        dataSection += `| Period | Gross Wages | Fringe | Net Dev Cost |\n|:-------|------------:|-------:|-------------:|\n`;
        for (const p of data.payroll) {
            dataSection += `| ${p.label} | $${p.grossWages.toFixed(2)} | $${p.fringeAmount.toFixed(2)} | $${p.netCost.toFixed(2)} |\n`;
        }
    }

    if (data.qre.length) {
        dataSection += `\n### Developer / QRE Summary — ${periodLabel}\n`;
        dataSection += `| Developer | Loaded Cost ($) |\n|:----------|----------------:|\n`;
        for (const q of data.qre) {
            dataSection += `| ${q.name} | $${q.netAllocatedCost.toFixed(2)} |\n`;
        }
    }

    if (data.amortization.length) {
        dataSection += `\n### Amortization Schedule — ${periodLabel}\n`;
        dataSection += `| Project | Month | Year | Charge |\n|:--------|------:|-----:|-------:|\n`;
        for (const a of data.amortization) {
            dataSection += `| ${a.projectName} | ${a.month} | ${a.year} | $${a.charge.toFixed(2)} |\n`;
        }
    }

    const sampleSection = sampleDocText && sampleDocText !== '[PDF could not be parsed]' && sampleDocText !== '[DOCX could not be parsed]'
        ? `\n\n---\n## REFERENCE DOCUMENT (Style + Content Guide)\nThe following document was provided as a reference. Use it in TWO ways:\n\n**1. Content guidance** — carry forward relevant policy language, accounting procedure descriptions, definitions, management representation language, and explanatory text. If the document describes a policy, methodology or judgment that still applies, adapt and incorporate that language into your draft. You are building on this prior work.\n\n**2. Formatting/style guidance** — mirror its section structure, tone, level of formality, and formatting conventions.\n\n**IMPORTANT**: The ONLY thing you must NOT carry forward is historical dollar amounts, dates, or project-specific numbers. Use ONLY the live financial data provided above for all figures.\n\n--- REFERENCE DOCUMENT BEGINS ---\n${sampleDocText.slice(0, 2500)}\n--- REFERENCE DOCUMENT ENDS ---`
        : '';

    // Apply {{PERIOD_LABEL}} and {{MEMO_TYPE}} substitutions
    const memoTypeLabel: Record<string, string> = {
        CAPITALIZATION:    'Software Capitalization',
        RD_METHODOLOGY:    'R&D Tax Credit',
        ACCOUNTING_POLICY: 'Accounting Policy',
        CUSTOM:            'General Accounting Policy',
    };
    const memoTypeDisplay = memoTypeLabel[memoType] ?? memoType.replace(/_/g, ' ');

    const instructions = (customSystemPrompt ?? DEFAULT_SYSTEM_INSTRUCTIONS)
        .replace(/{{PERIOD_LABEL}}/g, periodLabel)
        .replace(/{{MEMO_TYPE}}/g, memoTypeDisplay);

    return `You are an expert Technical Accounting Manager specializing in U.S. GAAP, software capitalization under ASC 350-40, and R&D tax credits under IRC §41.

**Memo Type:** ${memoTypeDisplay}
**Reporting Period:** ${periodLabel}
${sampleSection}

## LIVE FINANCIAL DATA
The following data is from the application database for ${periodLabel}. Reproduce all values exactly — do not alter, estimate, or round any numbers:
${dataSection || '\n(No financial data found for this period — use [TBD] placeholders in all tables.)\n'}

${instructions}`;
}

// ─── Call LLM ─────────────────────────────────────────────────────────────────
async function callLlm(provider: string, apiKey: string, model: string, prompt: string): Promise<string> {
    if (provider === 'openai') {
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({ apiKey });
        const res = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 3000,
        });
        return res.choices[0]?.message?.content ?? '';
    }

    if (provider === 'anthropic') {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey });
        const res = await client.messages.create({
            model,
            max_tokens: 3000,
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

// ─── Markdown → TipTap JSON ───────────────────────────────────────────────────
function markdownToTipTap(markdown: string): object {
    const lines = markdown.split('\n');
    const content: object[] = [];

    // Detect markdown table block
    let inTable = false;
    let tableRows: string[][] = [];
    let isHeaderRow = true;

    const flushTable = () => {
        if (!tableRows.length) return;
        // Separators are already filtered — first row = header, rest = body
        const [headerRow, ...bodyRows] = tableRows;
        const tableNode: any = {
            type: 'table',
            content: [
                {
                    type: 'tableRow',
                    content: (headerRow ?? []).map(cell => ({
                        type: 'tableHeader',
                        attrs: { colspan: 1, rowspan: 1, colwidth: null },
                        content: [{ type: 'paragraph', content: parseLine(cell.trim()) }],
                    })),
                },
                ...bodyRows.map(row => ({
                    type: 'tableRow',
                    content: row.map(cell => ({
                        type: 'tableCell',
                        attrs: { colspan: 1, rowspan: 1, colwidth: null },
                        content: [{ type: 'paragraph', content: parseLine(cell.trim()) }],
                    })),
                })),
            ],
        };
        content.push(tableNode);
        tableRows = [];
        isHeaderRow = true;
        inTable = false;
    };

    for (const line of lines) {
        const trimmed = line.trim();

        // Table row detection
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            inTable = true;
            // Skip separator rows like |---|---|
            if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
                continue;
            }
            const cells = trimmed.slice(1, -1).split('|');
            tableRows.push(cells);
            continue;
        }

        if (inTable) {
            flushTable();
        }

        if (!trimmed) continue;

        if (trimmed.startsWith('### ')) {
            content.push({ type: 'heading', attrs: { level: 3 }, content: parseLine(trimmed.slice(4)) });
        } else if (trimmed.startsWith('## ')) {
            content.push({ type: 'heading', attrs: { level: 2 }, content: parseLine(trimmed.slice(3)) });
        } else if (trimmed.startsWith('# ')) {
            content.push({ type: 'heading', attrs: { level: 1 }, content: parseLine(trimmed.slice(2)) });
        } else if (trimmed.startsWith('---')) {
            content.push({ type: 'horizontalRule' });
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            content.push({
                type: 'bulletList',
                content: [{
                    type: 'listItem',
                    content: [{ type: 'paragraph', content: parseLine(trimmed.slice(2)) }],
                }],
            });
        } else {
            const nodes = parseLine(trimmed);
            if (nodes.length) content.push({ type: 'paragraph', content: nodes });
        }
    }
    if (inTable) flushTable();

    return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

// Parse inline markdown: **bold**, *italic*, [text](url)
function parseLine(text: string): object[] {
    if (!text) return [];  // ← empty cells must return [] not [{text:''}]
    const parts: object[] = [];
    // Combined regex: links, bold, italic
    const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
            const raw = text.slice(last, m.index);
            if (raw) parts.push({ type: 'text', text: raw });
        }
        if (m[1] !== undefined) {
            // Markdown link [text](url)
            if (m[1]) parts.push({
                type: 'text',
                text: m[1],
                marks: [{ type: 'link', attrs: { href: m[2], target: '_blank' } }],
            });
        } else if (m[3] !== undefined) {
            // **bold**
            if (m[3]) parts.push({ type: 'text', text: m[3], marks: [{ type: 'bold' }] });
        } else if (m[4] !== undefined) {
            // *italic*
            if (m[4]) parts.push({ type: 'text', text: m[4], marks: [{ type: 'italic' }] });
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) {
        const remaining = text.slice(last);
        if (remaining) parts.push({ type: 'text', text: remaining });
    }
    // If regex consumed everything but produced nothing, return plain text node
    if (!parts.length && text) parts.push({ type: 'text', text });
    return parts;
}

// Recursively strip empty text nodes so Prosemirror never sees {type:'text',text:''}
function sanitizeContent(node: any): any {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'text') {
        if (!node.text || node.text === '') return null;  // will be filtered
        return node;
    }
    const sanitized = { ...node };
    if (Array.isArray(node.content)) {
        sanitized.content = node.content
            .map(sanitizeContent)
            .filter(Boolean)
            .filter((n: any) => n.type !== 'text' || n.text);
        // A paragraph with zero content is valid — keep it
    }
    return sanitized;
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse multipart OR JSON
    let memoType: string, year: number, month: number | null, title: string | undefined, category: string | undefined;
    let sampleDocText: string | null = null;

    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        memoType  = formData.get('memoType') as string;
        year      = parseInt(formData.get('year') as string);
        month     = formData.get('month') ? parseInt(formData.get('month') as string) : null;
        title     = formData.get('title') as string | undefined;
        category  = formData.get('category') as string | undefined;

        const file = formData.get('sampleDoc') as File | null;
        if (file && file.size > 0) {
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);
            sampleDocText = await extractTextFromFile(buffer, file.type, file.name);
        }
    } else {
        const body = await req.json();
        memoType = body.memoType;
        year     = body.year;
        month    = body.month ?? null;
        title    = body.title;
        category = body.category;
    }

    if (!memoType || !year) {
        return NextResponse.json({ error: 'memoType and year are required' }, { status: 400 });
    }

    const llmConfig = await db.llmConfig.findUnique({ where: { id: 'singleton' } });
    if (!llmConfig) {
        return NextResponse.json({ error: 'No LLM provider configured. Go to Admin → AI Configuration.' }, { status: 400 });
    }
    const model: string = llmConfig.model || PROVIDER_DEFAULTS[llmConfig.provider as string] || 'gpt-4o';

    // Gather period data
    const [projects, payrollImports, developers] = await Promise.all([
        prisma.project.findMany({
            where: { isCapitalizable: true },
            include: { tickets: { select: { allocatedAmount: true } } },
        }),
        prisma.payrollImport.findMany({
            where: { year },
            orderBy: { payDate: 'asc' },
            include: { entries: { include: { developer: { select: { name: true } } } } },
        }),
        prisma.developer.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);

    const projectData = projects
        .map(p => ({
            name: p.name,
            status: p.status,
            allocatedAmount: p.tickets.reduce((s, t) => s + (t.allocatedAmount ?? 0), 0),
        }))
        .filter(p => p.allocatedAmount > 0);

    const payrollData = payrollImports.map(pi => {
        const gross = pi.entries.reduce((s, e) => s + e.grossSalary, 0);
        const fringe = gross * pi.fringeBenefitRate;
        return { label: pi.label, grossWages: gross, fringeAmount: fringe, netCost: gross + fringe };
    });

    const devCostMap: Record<string, { name: string; netAllocatedCost: number }> = {};
    for (const pi of payrollImports) {
        for (const e of pi.entries) {
            if (!devCostMap[e.developerId]) {
                const dev = developers.find(d => d.id === e.developerId);
                devCostMap[e.developerId] = { name: dev?.name ?? 'Unknown', netAllocatedCost: 0 };
            }
            devCostMap[e.developerId].netAllocatedCost += e.grossSalary * (1 + pi.fringeBenefitRate);
        }
    }
    const qreData = Object.values(devCostMap).filter(d => d.netAllocatedCost > 0);

    const amortOverrides = await prisma.amortizationOverride.findMany({
        where: { year, ...(month ? { month } : {}) },
        include: { project: { select: { name: true } } },
    });
    const amortData = amortOverrides.map(a => ({
        projectName: a.project.name,
        month: a.month,
        year: a.year,
        charge: a.charge,
    }));

    const data = { projects: projectData, payroll: payrollData, qre: qreData, amortization: amortData };
    const prompt = buildPrompt(memoType, year, month, data, sampleDocText, llmConfig.customSystemPrompt as string | null);

    let markdown: string;
    try {
        markdown = await callLlm(llmConfig.provider as string, llmConfig.apiKey as string, model, prompt);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: `LLM error: ${msg}` }, { status: 500 });
    }

    // Guard against empty responses (e.g. token limit reached, API hiccup)
    if (!markdown || markdown.trim().length < 50) {
        return NextResponse.json(
            { error: 'The LLM returned an empty or unusable response. The prompt may be too long — try without a sample document, or choose a smaller PDF.' },
            { status: 500 }
        );
    }

    const rawContent = markdownToTipTap(markdown);
    const tiptapContent = sanitizeContent(rawContent);
    const memoCategory: string = category || memoType;
    const memoTitle: string = title || `${memoType.replace(/_/g, ' ')} — ${
        month
            ? new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
            : `FY ${year}`
    }`;

    const memo = await db.policyMemo.create({
        data: { title: memoTitle, category: memoCategory, year, content: tiptapContent },
    });

    return NextResponse.json({ memo });
}
