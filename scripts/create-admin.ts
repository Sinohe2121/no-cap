/**
 * Creates / resets the first admin user.
 * Run with:  node --env-file=.env scripts/create-admin.mjs
 * Or:        npx tsx scripts/create-admin.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMAIL = process.env.ADMIN_EMAIL || 'admin@no-cap.local';
const PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123!';

async function main() {
    const hash = await bcrypt.hash(PASSWORD, 12);

    const user = await prisma.user.upsert({
        where: { email: EMAIL },
        update: { passwordHash: hash, role: 'ADMIN' },
        create: {
            email: EMAIL,
            name: 'Admin',
            passwordHash: hash,
            role: 'ADMIN',
        },
    });

    console.log(`\n✅  Admin user ready:`);
    console.log(`   Email:    ${user.email}`);
    console.log(`   Password: ${PASSWORD}`);
    console.log(`   Role:     ${user.role}`);
    console.log(`\n⚠️  Change the password after first login!\n`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
