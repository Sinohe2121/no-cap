export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

const BAMBOO_KEYS = ['bamboo_subdomain', 'bamboo_api_key'];
const BAMBOO_LABELS: Record<string, string> = {
    bamboo_subdomain: 'BambooHR Subdomain',
    bamboo_api_key: 'BambooHR API Key',
};

// GET — return config (API key masked)
export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const rows = await prisma.globalConfig.findMany({
        where: { key: { in: BAMBOO_KEYS } },
    });
    const config: Record<string, string> = {};
    for (const row of rows) {
        config[row.key] = row.key === 'bamboo_api_key' ? '••••••••' : row.value;
    }
    return NextResponse.json({
        config,
        isConfigured: !!(config.bamboo_subdomain && config.bamboo_api_key),
    });
}

// POST — save credentials
export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    for (const key of BAMBOO_KEYS) {
        const val = body[key];
        if (val && val !== '' && val !== '••••••••') {
            await prisma.globalConfig.upsert({
                where: { key },
                update: { value: String(val).trim() },
                create: { key, value: String(val).trim(), label: BAMBOO_LABELS[key] },
            });
        }
    }
    return NextResponse.json({ ok: true });
}
