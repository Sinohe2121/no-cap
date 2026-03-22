export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { handleApiError, validatePassword } from '@/lib/apiError';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { CreateUserSchema, AdminUpdateSchema, formatZodError } from '@/lib/validations';


const DEFAULT_ROLES = [
    {
        id: 'ADMIN',
        name: 'Super Administrator',
        isSystem: true,
        permissions: [
            'VIEW_DASHBOARD', 'VIEW_REPORTS', 'VIEW_ENGINEERING_HEALTH', 'VIEW_TEAM_VIEW',
            'VIEW_PAYROLL_SUMMARY', 'VIEW_PAYROLL_DETAIL', 'VIEW_COST_ALLOCATION', 'MANAGE_PAYROLL_IMPORTS',
            'VIEW_PROJECTS', 'EDIT_PROJECTS', 'VIEW_TICKETS',
            'VIEW_ACCOUNTING', 'MANAGE_PERIODS',
            'VIEW_AUDIT', 'MANAGE_SOC2',
            'MANAGE_INTEGRATIONS', 'MANAGE_USERS', 'EDIT_SYSTEM_CONFIG',
        ]
    },
    {
        id: 'VIEWER',
        name: 'View-Only Base',
        isSystem: true,
        permissions: [
            'VIEW_DASHBOARD', 'VIEW_REPORTS', 'VIEW_ENGINEERING_HEALTH', 'VIEW_TEAM_VIEW',
            'VIEW_PAYROLL_SUMMARY', 'VIEW_PROJECTS', 'VIEW_TICKETS',
        ]
    }
];

export async function GET(req: NextRequest) {
    // Admin-only: reading global config and user list
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const configs = await prisma.globalConfig.findMany({ orderBy: { key: 'asc' } });
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });

        const activeRolesConfig = configs.find(c => c.key === 'ACCESS_ROLES');
        const roles = activeRolesConfig ? JSON.parse(activeRolesConfig.value) : DEFAULT_ROLES;

        return NextResponse.json({ configs, users, roles });
    } catch (error) {
        return handleApiError(error, 'Failed to load admin data');
    }
}

export async function PUT(req: NextRequest) {
    // Admin-only: changing global config or user roles
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const raw = await req.json();
        const parsed = AdminUpdateSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const body = parsed.data;

        if (body.type === 'config') {
            await prisma.globalConfig.upsert({
                where: { key: body.key },
                create: { key: body.key, value: String(body.value), label: body.label || body.key },
                update: { value: String(body.value) },
            });
        } else if (body.type === 'roles_array') {
            await prisma.globalConfig.upsert({
                where: { key: 'ACCESS_ROLES' },
                create: { key: 'ACCESS_ROLES', value: JSON.stringify(body.roles), label: 'Dynamic Access Matrix Arrays' },
                update: { value: JSON.stringify(body.roles) },
            });
        } else if (body.type === 'user_role') {
            const activeRolesConfig = await prisma.globalConfig.findUnique({ where: { key: 'ACCESS_ROLES' } });
            const dynamicRoles = activeRolesConfig ? JSON.parse(activeRolesConfig.value) : DEFAULT_ROLES;

            if (!dynamicRoles.find((r: { id: string }) => r.id === body.role)) {
                return NextResponse.json({ error: 'Invalid role specified.' }, { status: 400 });
            }
            await prisma.user.update({
                where: { id: body.id },
                data: { role: body.role },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, 'Failed to update configuration');
    }
}

export async function POST(req: NextRequest) {
    // Admin-only: provisioning a pristine generic target payload manually
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const raw = await req.json();
        const parsed = CreateUserSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const { email, name, role, password } = parsed.data;

        const activeRolesConfig = await prisma.globalConfig.findUnique({ where: { key: 'ACCESS_ROLES' } });
        const dynamicRoles = activeRolesConfig ? JSON.parse(activeRolesConfig.value) : DEFAULT_ROLES;

        if (!dynamicRoles.find((r: any) => r.id === role)) {
            return NextResponse.json({ error: 'Invalid role specified.' }, { status: 400 });
        }

        // Password is optional — Google OAuth users don't need one
        let passwordHash: string;
        if (password) {
            const passwordError = validatePassword(password);
            if (passwordError) {
                return NextResponse.json({ error: passwordError }, { status: 400 });
            }
            passwordHash = await bcrypt.hash(password, 12);
        } else {
            // Random hash — user will authenticate via Google only
            passwordHash = await bcrypt.hash(crypto.randomUUID(), 12);
        }

        const targetUser = await prisma.user.create({
            data: {
                email: email.toLowerCase().trim(),
                name,
                role,
                passwordHash,
            },
        });

        // Strip password hash before returning to client
        const { passwordHash: _, ...safeUserPayload } = targetUser;

        return NextResponse.json({ success: true, user: safeUserPayload });
    } catch (error) {
        return handleApiError(error, 'Failed to create user');
    }
}
