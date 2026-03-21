/**
 * Simple in-memory rate limiter using a sliding window.
 *
 * Fixes: S5 (no rate limiting on API routes)
 *
 * Usage in middleware:
 *   if (isRateLimited(ip, '/api/auth', 10, 60000)) return rateLimitResponse();
 */

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;

    for (const [key, entry] of Array.from(store.entries())) {
        entry.timestamps = entry.timestamps.filter((t: number) => now - t < windowMs);
        if (entry.timestamps.length === 0) store.delete(key);
    }
}

/**
 * Check if a request should be rate limited.
 *
 * @param identifier - Unique key (e.g., IP + route prefix)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns true if rate limited, false if allowed
 */
export function isRateLimited(
    identifier: string,
    maxRequests: number,
    windowMs: number
): boolean {
    cleanup(windowMs);

    const now = Date.now();
    const entry = store.get(identifier) ?? { timestamps: [] };

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
        return true; // Rate limited
    }

    entry.timestamps.push(now);
    store.set(identifier, entry);
    return false;
}

/**
 * Rate limit configuration by route pattern.
 */
export const RATE_LIMITS: { pattern: string; maxRequests: number; windowMs: number }[] = [
    // Auth: 10 attempts per minute
    { pattern: '/api/auth', maxRequests: 10, windowMs: 60_000 },
    // Integration syncs: 5 per minute (expensive operations)
    { pattern: '/api/integrations', maxRequests: 5, windowMs: 60_000 },
    // Journal entry generation: 3 per minute
    { pattern: '/api/accounting', maxRequests: 10, windowMs: 60_000 },
    // General API: 60 per minute
    { pattern: '/api/', maxRequests: 60, windowMs: 60_000 },
];

/**
 * Find the matching rate limit config for a given path.
 */
export function findRateLimit(pathname: string) {
    return RATE_LIMITS.find((rl) => pathname.startsWith(rl.pattern));
}
