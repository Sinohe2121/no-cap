import { calculatePeriodCosts, PeriodCostResult } from '@/lib/calculations';

/**
 * In-memory TTL cache for calculatePeriodCosts results.
 *
 * calculatePeriodCosts is heavy: it queries developers, payroll imports,
 * tickets, and 6 config rows, then runs an O(devs × tickets) allocation
 * pass. Multiple read endpoints call it for the same (month, year) within
 * seconds of each other — payroll audit, accounting summaries, etc.
 *
 * This cache eliminates that re-work. Writes that mutate the underlying
 * data must call `invalidatePeriodCostsCache()` to keep results fresh.
 */

interface CacheEntry {
    promise: Promise<PeriodCostResult[]>;
    expiresAt: number;
}

const TTL_MS = 60_000; // 60s — short enough that staleness is bounded
const cache = new Map<string, CacheEntry>();

const keyOf = (month: number, year: number) => `${year}-${String(month).padStart(2, '0')}`;

/** Cached read. Concurrent calls share a single in-flight promise. */
export function cachedCalculatePeriodCosts(month: number, year: number): Promise<PeriodCostResult[]> {
    const key = keyOf(month, year);
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.promise;

    const promise = calculatePeriodCosts(month, year);
    cache.set(key, { promise, expiresAt: now + TTL_MS });

    // If the underlying call rejects, drop the bad entry so the next caller
    // gets a fresh attempt instead of the cached failure.
    promise.catch(() => {
        const current = cache.get(key);
        if (current && current.promise === promise) cache.delete(key);
    });

    return promise;
}

/**
 * Drop one period from the cache (or the entire cache if no args).
 * Call after any mutation that affects period cost results: journal
 * entry generation, payroll import, jira ticket import, or changes to
 * developer/project/rule configuration.
 */
export function invalidatePeriodCostsCache(month?: number, year?: number) {
    if (month !== undefined && year !== undefined) {
        cache.delete(keyOf(month, year));
    } else {
        cache.clear();
    }
}
