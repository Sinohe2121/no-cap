export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export async function GET() {
    try {
        const projects = await prisma.project.findMany({
            include: {
                journalEntries: true,
                _count: { select: { tickets: true, journalEntries: true } },
            },
            orderBy: { accumulatedCost: 'desc' },
        });

        const capitalizedProjects = projects.filter(
            (p) => p.isCapitalizable && (p.status === 'DEV' || p.status === 'LIVE') && p._count.journalEntries > 0
        );

        let totalAtRisk = 0;
        let fullyCompliant = 0;
        let partiallyCompliant = 0;
        let nonCompliant = 0;

        const assessments = capitalizedProjects.map((project) => {
            const totalCapitalized = project.journalEntries
                .filter((e) => e.entryType === 'CAPITALIZATION')
                .reduce((s, e) => s + e.amount, 0);

            const criteriamet = (project.mgmtAuthorized ? 1 : 0) + (project.probableToComplete ? 1 : 0);
            const compliant = project.mgmtAuthorized && project.probableToComplete;
            const atRisk = compliant ? 0 : totalCapitalized;
            totalAtRisk += atRisk;

            if (compliant) fullyCompliant++;
            else if (criteriamet === 1) partiallyCompliant++;
            else nonCompliant++;

            let status: 'COMPLIANT' | 'PARTIAL' | 'AT_RISK';
            let recommendation: string;

            if (compliant) {
                status = 'COMPLIANT';
                recommendation = 'No action required. Project satisfies both ASU 2025-06 capitalization criteria.';
            } else if (!project.mgmtAuthorized && !project.probableToComplete) {
                status = 'AT_RISK';
                recommendation = `Enable both "Management Authorized" and "Probable to Complete" on the project detail page. Without these, ${fmt(totalCapitalized)} in capitalized costs may need to be restated as R&D expense under ASU 2025-06.`;
            } else if (!project.mgmtAuthorized) {
                status = 'PARTIAL';
                recommendation = `Enable "Management Authorized" to complete ASU 2025-06 compliance. ${fmt(totalCapitalized)} at risk without this flag.`;
            } else {
                status = 'PARTIAL';
                recommendation = `Enable "Probable to Complete" to complete ASU 2025-06 compliance. ${fmt(totalCapitalized)} at risk without this flag.`;
            }

            return {
                projectId: project.id,
                projectName: project.name,
                projectStatus: project.status,
                epicKey: project.epicKey,
                mgmtAuthorized: project.mgmtAuthorized,
                probableToComplete: project.probableToComplete,
                criteriamet,
                totalCriteria: 2,
                totalCapitalized,
                atRisk,
                complianceStatus: status,
                recommendation,
            };
        });

        // Overall compliance score (0–100)
        const total = capitalizedProjects.length;
        const complianceScore = total === 0 ? 100 : Math.round(
            (fullyCompliant * 100 + partiallyCompliant * 50 + nonCompliant * 0) / total
        );

        const summary = {
            totalCapitalizedProjects: total,
            fullyCompliant,
            partiallyCompliant,
            nonCompliant,
            totalAtRisk,
            complianceScore,
            standardEffectiveDate: 'December 15, 2025',
            guidance: total === 0
                ? 'No capitalized DEV or LIVE projects found.'
                : complianceScore === 100
                    ? 'All active capitalized projects satisfy ASU 2025-06 criteria.'
                    : `${nonCompliant + partiallyCompliant} project(s) require remediation before the standard takes effect. ${fmt(totalAtRisk)} in capitalized costs is at risk of restatement.`,
        };

        return NextResponse.json({ summary, assessments });
    } catch (error) {
        console.error('ASU report error:', error);
        return NextResponse.json({ error: 'Failed to generate ASU report' }, { status: 500 });
    }
}
