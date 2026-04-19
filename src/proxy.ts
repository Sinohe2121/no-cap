import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { isRateLimited, findRateLimit } from '@/lib/rateLimit';

export default withAuth(
    function middleware(req) {
        const { pathname } = req.nextUrl;
        const response = NextResponse.next();

        // ── S10: Security headers ──────────────────────────────────────────
        response.headers.set('X-Content-Type-Options', 'nosniff');
        response.headers.set('X-Frame-Options', 'DENY');
        response.headers.set('X-XSS-Protection', '1; mode=block');
        response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        response.headers.set(
            'Permissions-Policy',
            'camera=(), microphone=(), geolocation=()'
        );
        response.headers.set(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co"
        );

        // ── S5: Rate limiting ──────────────────────────────────────────────
        if (pathname.startsWith('/api/')) {
            const ip =
                req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                req.headers.get('x-real-ip') ||
                'unknown';
            const rateConfig = findRateLimit(pathname);
            if (rateConfig && isRateLimited(`${ip}::${rateConfig.pattern}`, rateConfig.maxRequests, rateConfig.windowMs)) {
                return NextResponse.json(
                    { error: 'Too many requests. Please try again later.' },
                    { status: 429 }
                );
            }
        }

        // ── S7: CSRF protection for mutation routes ────────────────────────
        const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
        if (
            pathname.startsWith('/api/') &&
            !pathname.startsWith('/api/auth') &&
            !pathname.startsWith('/api/webhooks') &&
            mutationMethods.includes(req.method)
        ) {
            const origin = req.headers.get('origin');
            const host = req.headers.get('host');
            if (origin && host) {
                const originHost = new URL(origin).host;
                if (originHost !== host) {
                    return NextResponse.json(
                        { error: 'Cross-origin request rejected' },
                        { status: 403 }
                    );
                }
            }
        }

        return response;
    },
    {
        callbacks: {
            // Return true → allow; false → redirect to /login
            authorized: ({ token }) => !!token,
        },
        pages: {
            signIn: '/login',
        },
    }
);

export const config = {
    matcher: [
        /*
         * Protect every route EXCEPT:
         * - /login
         * - /api/auth/**  (NextAuth own endpoints)
         * - /api/webhooks/** (GitHub webhook — signature-verified internally)
         * - Next.js internals (_next/*, favicon, public assets)
         */
        '/((?!login|api/auth|api/webhooks|api/config/logo|_next/static|_next/image|favicon.ico).*)',
    ],
};
