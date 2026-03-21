import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Fix #23 — enable query/warn/error logging in development to surface N+1s and slow queries
// R11: Made configurable via PRISMA_LOG_LEVEL env var (e.g., 'query,warn,error')
const logLevels = process.env.PRISMA_LOG_LEVEL?.split(',').map(s => s.trim()) as ('query' | 'warn' | 'error' | 'info')[] | undefined;
export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: logLevels ?? (process.env.NODE_ENV === 'development'
            ? ['query', 'warn', 'error']
            : ['warn', 'error']),
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
