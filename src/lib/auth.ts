import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

// ─── NextAuth configuration ────────────────────────────────────────────────
export const authOptions: AuthOptions = {
    providers: [
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email.toLowerCase().trim() },
                });

                if (!user) {
                    // Prevent timing attack (username enumeration) by simulating work
                    // A standard bcrypt hash used for dummy comparison
                    await bcrypt.compare(credentials.password, '$2a$10$8K1p/a00qWKte1pi1aXGQe');
                    return null;
                }

                const valid = await bcrypt.compare(credentials.password, user.passwordHash);
                if (!valid) return null;

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                };
            },
        }),
        // Google OAuth — only allows users whose email already exists in the User table
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
            ? [GoogleProvider({
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              })]
            : []),
    ],
    callbacks: {
        async signIn({ user, account }) {
            // For OAuth providers (Google), verify the email exists in our User table
            if (account?.provider === 'google') {
                if (!user.email) return false;
                const dbUser = await prisma.user.findUnique({
                    where: { email: user.email.toLowerCase().trim() },
                });
                if (!dbUser) {
                    // Reject — email not provisioned by admin
                    return '/login?error=NoAccount';
                }
            }
            return true;
        },
        async jwt({ token, user, account }) {
            if (user && account?.provider === 'credentials') {
                // Credentials login — role comes from authorize()
                token.id = user.id;
                token.role = (user as { role?: string }).role ?? 'VIEWER';
            } else if (account?.provider === 'google' && user?.email) {
                // Google login — look up role from DB
                const dbUser = await prisma.user.findUnique({
                    where: { email: user.email.toLowerCase().trim() },
                });
                if (dbUser) {
                    token.id = dbUser.id;
                    token.role = dbUser.role;
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as { id?: string }).id = token.id as string;
                (session.user as { role?: string }).role = token.role as string;
            }
            return session;
        },
    },
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 8 * 60 * 60, // 8 hours
    },
    secret: process.env.NEXTAUTH_SECRET,
};

// ─── Request-level auth helpers ───────────────────────────────────────────

/**
 * Returns the JWT token if the request is authenticated, or responds with 401.
 * Usage: const auth = await requireAuth(req); if (auth instanceof NextResponse) return auth;
 */
export async function requireAuth(req: NextRequest | Request) {
    const token = await getToken({ req: req as NextRequest, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return token;
}

/**
 * Returns the JWT token if the authenticated user has ADMIN role, or responds with 401/403.
 */
export async function requireAdmin(req: NextRequest | Request) {
    const token = await getToken({ req: req as NextRequest, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (token.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }
    return token;
}
