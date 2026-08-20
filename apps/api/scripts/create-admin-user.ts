/**
 * Create or promote a user account to ADMIN.
 *
 * Usage:
 * pnpm run admin:create -- --email admin@example.com --password "StrongPassword1!"
 *
 * Optional flags:
 * --first-name Ada
 * --last-name Admin
 * --phone 08000000000
 *
 * If the user already exists, the script promotes them to ADMIN, activates the
 * account, verifies the email if needed, and only resets the password when a
 * new password is provided.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import {
  closePrismaScriptContext,
  createPrismaScriptContext,
} from './_prisma-script-client';

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

async function main() {
  const email = (getArg('--email') ?? process.env['ADMIN_EMAIL'] ?? '')
    .toLowerCase()
    .trim();
  const password = getArg('--password') ?? process.env['ADMIN_PASSWORD'] ?? '';
  const firstName =
    getArg('--first-name') ?? process.env['ADMIN_FIRST_NAME'] ?? 'Admin';
  const lastName =
    getArg('--last-name') ?? process.env['ADMIN_LAST_NAME'] ?? 'User';
  const phone = getArg('--phone') ?? process.env['ADMIN_PHONE'] ?? null;

  if (!email) {
    throw new Error('Provide --email or set ADMIN_EMAIL');
  }

  const context = createPrismaScriptContext();

  try {
    const existingUser = await context.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

    if (existingUser) {
      const updatedUser = await context.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          firstName: firstName || existingUser.firstName,
          lastName: lastName || existingUser.lastName,
          phone: phone ?? existingUser.phone,
          emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
          ...(passwordHash ? { passwordHash } : {}),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
        },
      });

      console.log('Promoted existing user to ADMIN:');
    console.log(updatedUser);

      if (!passwordHash && !existingUser.passwordHash) {
        console.log(
          'No password is set for this account. Re-run with --password if you want password-based admin login.',
        );
      }

      console.log(
        'MFA: this admin must enroll TOTP on first login (POST /auth/admin/login → /auth/admin/mfa/enroll/*).',
      );

      return;
    }

    if (!password) {
      throw new Error(
        'A password is required when creating a brand-new admin account. Provide --password or set ADMIN_PASSWORD.',
      );
    }

    const createdUser = await context.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        phone,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    });

    console.log('Created new ADMIN user:');
    console.log(createdUser);
    console.log(
      'MFA: this admin must enroll TOTP on first login (POST /auth/admin/login → /auth/admin/mfa/enroll/*).',
    );
  } finally {
    await closePrismaScriptContext(context);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
