import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Public read-only endpoint for fiscal year configuration.
 * Used by the client-side PeriodContext so it can compute FY-aware date ranges.
 */
export async function GET() {
    try {
        const [row, oldest, newest] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'FISCAL_YEAR_START_MONTH' } }),
            prisma.accountingPeriod.findFirst({ orderBy: [{ year: 'asc' }, { month: 'asc' }] }),
            prisma.accountingPeriod.findFirst({ orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
        ]);
        // Store as 1-12 (January = 1). Default to 1 (calendar year).
        const month = row ? parseInt(row.value, 10) : 1;
        return NextResponse.json({
            fiscalYearStartMonth: isNaN(month) ? 1 : Math.min(12, Math.max(1, month)),
            periodBounds: oldest && newest ? {
                oldestMonth: oldest.month,
                oldestYear: oldest.year,
                newestMonth: newest.month,
                newestYear: newest.year,
            } : null,
        });
    } catch {
        return NextResponse.json({ fiscalYearStartMonth: 1, periodBounds: null });
    }
}
