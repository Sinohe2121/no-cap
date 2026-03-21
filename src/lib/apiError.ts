import { NextResponse } from 'next/server';

/**
 * Standard API error handler — prevents leaking internal details to clients.
 *
 * Fixes: S3 (error object serialization), S4 (err.message exposure), R3 (inconsistent error handling)
 *
 * Usage:
 *   } catch (error) {
 *       return handleApiError(error, 'Failed to load data');
 *   }
 */
export function handleApiError(
    error: unknown,
    publicMessage: string,
    statusCode: number = 500
): NextResponse {
    // Log full error internally for debugging
    console.error(`[API Error] ${publicMessage}:`, error);

    // Handle Prisma unique constraint violations
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const prismaError = error as { code: string };
        if (prismaError.code === 'P2002') {
            return NextResponse.json(
                { error: 'A record with this value already exists.' },
                { status: 409 }
            );
        }
        if (prismaError.code === 'P2025') {
            return NextResponse.json(
                { error: 'Record not found.' },
                { status: 404 }
            );
        }
    }

    // Return safe, generic message to client — NEVER return error.message or String(error)
    return NextResponse.json({ error: publicMessage }, { status: statusCode });
}

/**
 * Validate required fields on a request body.
 * Returns a 400 response if any are missing, or null if all present.
 */
export function validateRequired(
    body: Record<string, unknown>,
    fields: string[]
): NextResponse | null {
    const missing = fields.filter(
        (f) => body[f] === undefined || body[f] === null || body[f] === ''
    );
    if (missing.length > 0) {
        return NextResponse.json(
            { error: `Missing required fields: ${missing.join(', ')}` },
            { status: 400 }
        );
    }
    return null;
}

/**
 * Password complexity validator.
 * Requires: 8+ chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char.
 */
export function validatePassword(password: string): string | null {
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain a digit';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password))
        return 'Password must contain a special character';
    return null;
}

/**
 * Sanitize a CSV cell value to prevent formula injection.
 * Prefixes cells starting with =, +, -, @, \t, \r with a single quote.
 */
export function sanitizeCSVCell(val: string): string {
    if (/^[=+\-@\t\r]/.test(val)) {
        val = `'${val}`;
    }
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
}
