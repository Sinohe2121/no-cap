export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

const BAMBOO_ROLE_MAP: Record<string, string> = {
    'Software Engineer': 'ENG',
    'Senior Software Engineer': 'ENG',
    'Staff Engineer': 'ENG',
    'Principal Engineer': 'ENG',
    'Product Manager': 'PRODUCT',
    'Senior Product Manager': 'PRODUCT',
    'Designer': 'DESIGN',
    'UX Designer': 'DESIGN',
    'Product Designer': 'DESIGN',
    'Data Engineer': 'DATA',
    'Data Analyst': 'DATA',
    'QA Engineer': 'QA',
};

function mapRole(jobTitle: string | undefined): string {
    if (!jobTitle) return 'ENG';
    const direct = BAMBOO_ROLE_MAP[jobTitle];
    if (direct) return direct;
    const lower = jobTitle.toLowerCase();
    if (lower.includes('engineer') || lower.includes('developer')) return 'ENG';
    if (lower.includes('product') || lower.includes('pm')) return 'PRODUCT';
    if (lower.includes('design')) return 'DESIGN';
    if (lower.includes('data')) return 'DATA';
    if (lower.includes('qa') || lower.includes('quality')) return 'QA';
    return 'ENG';
}

// Load BambooHR credentials from GlobalConfig (never from the request body)
async function loadBambooCredentials(): Promise<{ subdomain: string; apiKey: string } | null> {
    const rows = await prisma.globalConfig.findMany({
        where: { key: { in: ['bamboo_subdomain', 'bamboo_api_key'] } },
    });
    const cfg: Record<string, string> = {};
    for (const r of rows) cfg[r.key] = r.value;
    if (!cfg.bamboo_subdomain || !cfg.bamboo_api_key) return null;
    return { subdomain: cfg.bamboo_subdomain, apiKey: cfg.bamboo_api_key };
}

export async function POST(req: NextRequest) {
    // Admin only — BambooHR import/preview
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    try {
        // Credentials come from the server-side DB, not the request body
        const creds = await loadBambooCredentials();
        if (!creds) {
            return NextResponse.json({
                error: 'BambooHR is not configured. Go to Admin → Integrations and save your BambooHR subdomain and API key.',
                configRequired: true,
            }, { status: 400 });
        }

        const body = await req.json();
        const { action, rows } = body;

        if (action === 'import') {
            if (!Array.isArray(rows) || rows.length === 0) {
                return NextResponse.json({ error: 'rows array required for import' }, { status: 400 });
            }
            let imported = 0, skipped = 0;
            const errors: string[] = [];
            for (const row of rows) {
                try {
                    const existing = await prisma.developer.findUnique({ where: { email: row.email } });
                    if (existing) { skipped++; continue; }
                    await prisma.developer.create({
                        data: {
                            name: row.name,
                            email: row.email.toLowerCase(),
                            jiraUserId: row.jiraUserId || '',
                            role: row.role || 'ENG',
                            monthlySalary: Number(row.monthlySalary) || 0,
                            fringeBenefitRate: 0.25,
                            stockCompAllocation: 0,
                            isActive: true,
                        },
                    });
                    imported++;
                } catch {
                    errors.push(row.email);
                }
            }
            return NextResponse.json({ imported, skipped, errors });
        }

        // action === 'preview' (default) — fetch from BambooHR using stored credentials
        const url = `https://api.bamboohr.com/api/gateway.php/${creds.subdomain}/v1/employees/directory`;
        const res = await fetch(url, {
            headers: {
                Authorization: `Basic ${Buffer.from(`${creds.apiKey}:x`).toString('base64')}`,
                Accept: 'application/json',
            },
            signal: AbortSignal.timeout(15_000), // 15s timeout
        });

        if (!res.ok) {
            const msg = res.status === 401
                ? 'Invalid API key or subdomain — update credentials in Admin → Integrations'
                : `BambooHR returned ${res.status}`;
            return NextResponse.json({ error: msg }, { status: res.status });
        }

        const data = await res.json() as {
            employees: { id: string; displayName: string; workEmail: string; jobTitle: string; status: string }[]
        };
        const employees = data.employees || [];
        const existingEmails = new Set(
            (await prisma.developer.findMany({ select: { email: true } })).map((d) => d.email)
        );

        const preview = employees
            .filter((e) => e.status === 'Active' && e.workEmail)
            .map((e) => ({
                bambooId: e.id,
                name: e.displayName,
                email: e.workEmail?.toLowerCase(),
                role: mapRole(e.jobTitle),
                jobTitle: e.jobTitle,
                monthlySalary: 0,
                jiraUserId: '',
                alreadyExists: existingEmails.has(e.workEmail?.toLowerCase()),
            }));

        return NextResponse.json({ preview, total: preview.length });
    } catch (e) {
        if (e instanceof Error && e.name === 'TimeoutError') {
            return NextResponse.json({ error: 'BambooHR request timed out (15s)' }, { status: 504 });
        }
        console.error('BambooHR error:', e);
        return NextResponse.json({ error: 'Failed to connect to BambooHR' }, { status: 500 });
    }
}
