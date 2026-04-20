export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import prisma from '@/lib/prisma';
import { PayrollRegisterImportSchema, formatZodError } from '@/lib/validations';
import { invalidatePeriodCostsCache } from '@/lib/calculationsCache';

export async function POST(request: Request) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const raw = await request.json();
        const parsed = PayrollRegisterImportSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { label, payDate, rows } = parsed.data;

        const pd = new Date(payDate);
        const year = pd.getFullYear();

        // Lock fringe benefit rate from GlobalConfig at import time
        const [fringeConfig, meetingConfig] = await Promise.all([
            prisma.globalConfig.findUnique({ where: { key: 'FRINGE_BENEFIT_RATE' } }),
            prisma.globalConfig.findUnique({ where: { key: 'MEETING_TIME_RATE' } }),
        ]);
        const fringeBenefitRate = fringeConfig ? parseFloat(fringeConfig.value) : 0.25;
        const meetingTimeRate = meetingConfig ? parseFloat(meetingConfig.value) : 0;

        // Upsert the PayrollImport for this pay date
        const payrollImport = await prisma.payrollImport.upsert({
            where: { payDate: pd },
            update: { label, fringeBenefitRate, meetingTimeRate },
            create: { label, payDate: pd, year, fringeBenefitRate, meetingTimeRate },
        });

        // Resolve developer IDs by email
        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const row of rows) {
            const email = (row.email || '').trim().toLowerCase();
            const grossSalary = parseFloat(String(row.grossSalary).replace(/[\$,\s]/g, '')) || 0;
            const sbcAmount = parseFloat(String(row.sbcAmount || '0').replace(/[\$,\s]/g, '')) || 0;
            if (!email) { skipped++; continue; }

            const developer = await prisma.developer.findUnique({ where: { email } });
            if (!developer) {
                errors.push(`Developer not found: ${email}`);
                skipped++;
                continue;
            }

            await prisma.payrollEntry.upsert({
                where: {
                    developerId_payrollImportId: {
                        developerId: developer.id,
                        payrollImportId: payrollImport.id,
                    },
                },
                update: { grossSalary, sbcAmount },
                create: {
                    developerId: developer.id,
                    payrollImportId: payrollImport.id,
                    grossSalary,
                    sbcAmount,
                },
            });
            imported++;
        }

        // Cost results for this month are now stale.
        invalidatePeriodCostsCache(pd.getMonth() + 1, year);

        return NextResponse.json({
            message: `Imported ${imported} entries, skipped ${skipped}`,
            imported,
            skipped,
            errors,
            payrollImportId: payrollImport.id,
        });
    } catch (error) {
        return handleApiError(error, 'Payroll import failed');
    }
}
