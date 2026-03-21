import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const logoConfig = await prisma.globalConfig.findUnique({
            where: { key: 'COMPANY_LOGO' },
        });

        if (!logoConfig || !logoConfig.value) {
            return NextResponse.json({ logoUrl: null });
        }

        return NextResponse.json({ logoUrl: logoConfig.value });
    } catch (error) {
        console.error('Failed to fetch company logo:', error);
        return NextResponse.json({ error: 'Failed to fetch logo' }, { status: 500 });
    }
}
