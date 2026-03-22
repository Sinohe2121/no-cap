export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

const REQUIRED_COLS = ['name', 'email', 'role'];
const OPTIONAL_COLS = ['monthlySalary', 'jiraUserId', 'fringeBenefitRate', 'stockCompAllocation'];
const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS];

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map((line) => {
        const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
    });
    return { headers, rows };
}

// POST — parse CSV and either preview or import
export async function POST(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const formData = await req.formData();
        const action = formData.get('action') as string || 'preview';
        const file = formData.get('file') as File | null;
        const rawRows = formData.get('rows') as string | null;

        // Import mode uses pre-parsed JSON rows
        if (action === 'import' && rawRows) {
            const rows = JSON.parse(rawRows) as Record<string, string>[];
            let imported = 0, skipped = 0;
            const errors: string[] = [];

            const existingEmails = new Set(
                (await prisma.developer.findMany({ select: { email: true } })).map((d) => d.email)
            );

            for (const row of rows) {
                if (!row.email || !row.name) { errors.push(`Missing name/email: ${JSON.stringify(row)}`); continue; }
                const email = row.email.toLowerCase();
                if (existingEmails.has(email)) { skipped++; continue; }
                try {
                    await prisma.developer.create({
                        data: {
                            name: row.name.trim(),
                            email,
                            jiraUserId: (row.jiraUserId || '').trim(),
                            role: (row.role || 'ENG').toUpperCase(),
                            monthlySalary: parseFloat(row.monthlySalary) || 0,
                            fringeBenefitRate: parseFloat(row.fringeBenefitRate) || 0.25,
                            stockCompAllocation: parseFloat(row.stockCompAllocation) || 0,
                            isActive: true,
                        },
                    });
                    imported++;
                } catch {
                    errors.push(email);
                }
            }
            return NextResponse.json({ imported, skipped, errors });
        }

        // Preview mode: parse the uploaded file
        if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        const text = await file.text();
        const { headers, rows } = parseCSV(text);

        // Validate required columns exist
        const missing = REQUIRED_COLS.filter((c) => !headers.map((h) => h.toLowerCase()).includes(c.toLowerCase()));
        if (missing.length > 0) {
            return NextResponse.json({
                error: `Missing required columns: ${missing.join(', ')}`,
                headers,
                requiredColumns: REQUIRED_COLS,
                optionalColumns: OPTIONAL_COLS,
            }, { status: 400 });
        }

        // Case-insensitive column lookup
        const colMap: Record<string, string> = {};
        for (const col of ALL_COLS) {
            const found = headers.find((h) => h.toLowerCase() === col.toLowerCase());
            if (found) colMap[col] = found;
        }

        const existingEmails = new Set(
            (await prisma.developer.findMany({ select: { email: true } })).map((d) => d.email)
        );

        const preview = rows
            .filter((r) => r[colMap.email] && r[colMap.name])
            .map((r) => ({
                name: r[colMap.name],
                email: r[colMap.email]?.toLowerCase(),
                role: (r[colMap.role] || 'ENG').toUpperCase(),
                monthlySalary: parseFloat(r[colMap.monthlySalary] || '0') || 0,
                jiraUserId: r[colMap.jiraUserId] || '',
                fringeBenefitRate: parseFloat(r[colMap.fringeBenefitRate] || '0.25') || 0.25,
                stockCompAllocation: parseFloat(r[colMap.stockCompAllocation] || '0') || 0,
                alreadyExists: existingEmails.has(r[colMap.email]?.toLowerCase()),
            }));

        return NextResponse.json({
            preview,
            total: preview.length,
            headers,
            detectedColumns: Object.keys(colMap),
        });
    } catch (e) {
        console.error('CSV roster error:', e);
        return NextResponse.json({ error: 'Failed to parse CSV' }, { status: 500 });
    }
}
