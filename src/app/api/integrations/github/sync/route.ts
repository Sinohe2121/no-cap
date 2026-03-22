export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

const GITHUB_API_VERSION = '2022-11-28';
const PER_PAGE = 100; // GitHub's max per page

interface GitHubPR {
    number: number;
    title: string;
    user: { login: string };
    merged_at: string | null;
    html_url: string;
}

// Fetch ALL closed PRs for a repo using GitHub's pagination (Link header)
async function fetchAllClosedPRs(
    owner: string,
    name: string,
    token: string
): Promise<GitHubPR[]> {
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
    };

    const all: GitHubPR[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const url =
            `https://api.github.com/repos/${owner}/${name}/pulls` +
            `?state=closed&per_page=${PER_PAGE}&sort=updated&direction=desc&page=${page}`;

        const res = await fetch(url, { headers });
        if (!res.ok) {
            throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
        }

        const prs = await res.json() as GitHubPR[];
        all.push(...prs);

        // GitHub returns < per_page items on the last page
        hasMore = prs.length === PER_PAGE;
        page++;
    }

    return all;
}

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin(req);
        if (auth instanceof NextResponse) return auth;

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            return NextResponse.json({ error: 'GITHUB_TOKEN env var not set' }, { status: 503 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = prisma as any;
        const repos = await db.gitHubRepo.findMany({ where: { isActive: true } });
        if (repos.length === 0) {
            return NextResponse.json({ synced: 0, message: 'No repos connected' });
        }

        // Verify project mappings are to DEV+capitalizable projects
        const capitalProjects = await prisma.project.findMany({
            where: { isCapitalizable: true },
            select: { id: true },
        });
        const capProjectIds = new Set(capitalProjects.map((p) => p.id));

        let totalSynced = 0;
        const errors: string[] = [];

        for (const repo of repos) {
            try {
                // Fix #12 — paginate through ALL closed PRs, not just the first 30
                const prs = await fetchAllClosedPRs(repo.owner, repo.name, token);

                for (const pr of prs) {
                    const effectiveProjectId = repo.projectId && capProjectIds.has(repo.projectId)
                        ? repo.projectId
                        : null;

                    // merged_at present + project is a DEV capitalizable project = CAPITALIZE
                    const classification = pr.merged_at
                        ? (effectiveProjectId ? 'CAPITALIZE' : 'UNCLASSIFIED')
                        : 'EXPENSE';

                    await db.gitHubEvent.upsert({
                        where: { githubId: `${repo.owner}/${repo.name}#${pr.number}` },
                        create: {
                            eventType: 'PR',
                            githubId: `${repo.owner}/${repo.name}#${pr.number}`,
                            repoOwner: repo.owner,
                            repoName: repo.name,
                            title: pr.title,
                            author: pr.user.login,
                            url: pr.html_url,
                            mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
                            classification,
                            projectId: effectiveProjectId,
                            repoId: repo.id,
                        },
                        update: {
                            mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
                            classification,
                            projectId: effectiveProjectId,
                        },
                    });
                    totalSynced++;
                }
            } catch (repoErr) {
                console.error(`GitHub sync error for ${repo.owner}/${repo.name}:`, repoErr);
                errors.push(`${repo.owner}/${repo.name}: sync failed`);
            }
        }

        // Save last sync timestamp
        await prisma.globalConfig.upsert({
            where: { key: 'GITHUB_LAST_SYNC' },
            create: { key: 'GITHUB_LAST_SYNC', value: new Date().toISOString(), label: 'GitHub Last Sync' },
            update: { value: new Date().toISOString() },
        });

        return NextResponse.json({
            synced: totalSynced,
            repos: repos.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (e) {
        console.error('GitHub sync error:', e);
        return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
    }
}

// GET — return last sync metadata
export async function GET() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = prisma as any;
        const lastSync = await prisma.globalConfig.findUnique({ where: { key: 'GITHUB_LAST_SYNC' } });
        const repoCount = await db.gitHubRepo.count({ where: { isActive: true } });
        const eventCount = await db.gitHubEvent.count();
        return NextResponse.json({
            lastSync: lastSync?.value || null,
            repoCount,
            eventCount,
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
