import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import prisma from '@/lib/prisma';

// GitHub webhook receiver for pull_request events
// Requires GITHUB_WEBHOOK_SECRET env var — set it in GitHub repo → Settings → Webhooks
export async function POST(req: Request) {
    // ── Critical: Verify HMAC-SHA256 signature before processing payload ──
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
        console.error('GITHUB_WEBHOOK_SECRET is not set — rejecting webhook');
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const signature = req.headers.get('x-hub-signature-256');
    if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const rawBody = await req.text();
    const expectedSig = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
        const sigBuf = Buffer.from(signature, 'utf8');
        const expBuf = Buffer.from(expectedSig, 'utf8');
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
    } catch {
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }

    // ── Parse verified payload ─────────────────────────────────────────────
    try {
        const payload = JSON.parse(rawBody);
        const action = payload.action as string;
        const pr = payload.pull_request;
        const repository = payload.repository;

        // Only process closed (merged) PRs
        if (!pr || action !== 'closed') {
            return NextResponse.json({ skipped: true });
        }

        const repoOwner = repository.owner.login as string;
        const repoName = repository.name as string;
        const mergedAt = pr.merged_at as string | null;

        // Look up the repo mapping
        const repo = await (prisma as unknown as Record<string, unknown> & { gitHubRepo: { findUnique: (args: unknown) => Promise<{ projectId: string | null; id: string } | null> } }).gitHubRepo.findUnique({
            where: { owner_name: { owner: repoOwner, name: repoName } },
        });

        // Classify: merged + mapped to DEV capitalizable project = CAPITALIZE
        let classification = 'UNCLASSIFIED';
        let projectId: string | null = null;

        if (repo?.projectId) {
            const project = await prisma.project.findUnique({
                where: { id: repo.projectId },
                select: { isCapitalizable: true, status: true },
            });
            if (project?.isCapitalizable && mergedAt) {
                classification = 'CAPITALIZE';
            } else {
                classification = 'EXPENSE';
            }
            projectId = repo.projectId;
        } else if (mergedAt) {
            classification = 'EXPENSE';
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = prisma as any;
        await db.gitHubEvent.upsert({
            where: { githubId: `${repoOwner}/${repoName}#${pr.number}` },
            create: {
                eventType: 'PR',
                githubId: `${repoOwner}/${repoName}#${pr.number}`,
                repoOwner,
                repoName,
                title: pr.title,
                author: pr.user.login,
                url: pr.html_url,
                mergedAt: mergedAt ? new Date(mergedAt) : null,
                classification,
                projectId,
                repoId: repo?.id ?? null,
            },
            update: {
                mergedAt: mergedAt ? new Date(mergedAt) : null,
                classification,
                projectId,
            },
        });

        return NextResponse.json({ received: true, classification });
    } catch (e) {
        console.error('GitHub webhook error:', e);
        return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
    }
}
