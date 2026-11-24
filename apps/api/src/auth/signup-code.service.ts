import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { UserRole, UserStatus, TokenType } from '../generated/prisma/client';
import { AuditAction, AuthSurface } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ObservabilityService } from '../observability/observability.service';
import { AuthSessionService } from './auth-session.service';
import { isRoleAllowedForSurface } from './auth-surface';
import { hashAuthToken, mintAuthToken } from './auth-token.crypto';
import {
  generateSignupCode,
  hashSignupCode,
  resolveSignupCodeKey,
  signupCodeMatches,
} from './signup-code.crypto';
import type { RegisterStartDto } from './dto/signup-code.dto';
import type { JwtPayload } from './strategies/jwt.strategy';
import type { LoginSessionResult } from './auth.service';
import {
  AUTH_LINK_JOB_OPTIONS,
  JOB_SIGNUP_CODE_EMAIL,
  MAIL_QUEUE_NAME,
  SIGNUP_CODE_MAX_ATTEMPTS,
  SIGNUP_CODE_TTL_MS,
  SIGNUP_MAX_SENDS_PER_HOUR,
  SIGNUP_RESEND_COOLDOWN_SECONDS,
} from '../constants';

/** The one answer for every way a confirmation can fail: wrong, expired, locked, unknown, replayed. */
export const INVALID_SIGNUP_CODE_CODE = 'INVALID_SIGNUP_CODE';

function invalidCodeError(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: INVALID_SIGNUP_CODE_CODE,
    message: 'Invalid or expired code',
  });
}

export const SIGNUP_CODE_SENT_MESSAGE =
  'If these details can be used, we have sent a 6-digit code to your email address.';

/** Database clock as a UTC timestamp, matching how Prisma stores DateTime columns. */
const DB_NOW = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

/**
 * A send is allowed once the cooldown has passed and either fewer than the hourly cap was sent
 * or the one-hour window has ended. Evaluated by the database on the existing row.
 */
const SEND_ALLOWED = Prisma.sql`(
  "pending_signups"."lastSentAt" <= ${DB_NOW} - make_interval(secs => ${SIGNUP_RESEND_COOLDOWN_SECONDS})
  AND (
    "pending_signups"."sendCount" < ${SIGNUP_MAX_SENDS_PER_HOUR}
    OR "pending_signups"."windowStartedAt" < ${DB_NOW} - interval '1 hour'
  )
)`;
const WINDOW_ENDED = Prisma.sql`("pending_signups"."windowStartedAt" < ${DB_NOW} - interval '1 hour')`;

type ReservedSignup = {
  id: string;
  email: string;
  codeHash: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
};

type ExistingUser = {
  id: string;
  emailVerifiedAt: Date | null;
  status: UserStatus;
  role: UserRole;
};

/**
 * TTW-254: sign-up confirmed by a one-time code sent by email.
 *
 * No user exists until the code is entered. The sign-up is bound to the
 * browser that started it by a random token; the code is stored only as a keyed
 * HMAC; attempts, resend cooldown and the hourly send cap are enforced by
 * conditional SQL on the pending row so concurrency cannot get around them.
 */
@Injectable()
export class SignupCodeService {
  private readonly logger = new Logger(SignupCodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly observability: ObservabilityService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly authSession: AuthSessionService,
    @InjectQueue(MAIL_QUEUE_NAME) private readonly mailQueue: Queue,
  ) {}

  private key(): Buffer {
    return resolveSignupCodeKey({
      SIGNUP_CODE_HMAC_KEY: this.config.get<string>('SIGNUP_CODE_HMAC_KEY'),
      JWT_ACCESS_SECRET: this.config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * An account created by the old register route and never confirmed can be taken over by
   * whoever proves the mailbox (same rule as the Google link, TTW-179). Anything else that
   * already exists blocks the sign-up.
   */
  private isTakeoverable(user: ExistingUser): boolean {
    return (
      user.emailVerifiedAt === null &&
      user.status === UserStatus.ACTIVE &&
      isRoleAllowedForSurface(user.role, AuthSurface.CUSTOMER)
    );
  }

  /**
   * Start (or restart) a sign-up. Always answers the same, whether or not the address already
   * has an account, and always does the same password hashing work first.
   */
  async start(
    dto: RegisterStartDto,
  ): Promise<{ message: string; signupToken: string }> {
    const email = dto.email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const signupToken = mintAuthToken();

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true, status: true, role: true },
    });
    if (existing && !this.isTakeoverable(existing)) {
      // Decoy: a token of the same shape that matches nothing.
      return { message: SIGNUP_CODE_SENT_MESSAGE, signupToken };
    }

    const code = generateSignupCode();
    const codeHash = hashSignupCode(this.key(), email, code);
    const ttlSeconds = SIGNUP_CODE_TTL_MS / 1000;

    // One statement: insert, or overwrite the credentials and token of the existing row and send
    // a new code only when the cooldown and hourly cap allow it. Nothing is read first.
    const rows = await this.prisma.$queryRaw<
      { sent: boolean; expiresAt: Date }[]
    >(Prisma.sql`
      INSERT INTO "pending_signups"
        ("id", "email", "signupTokenHash", "codeHash", "passwordHash", "firstName", "lastName",
         "phone", "attempts", "sendCount", "windowStartedAt", "lastSentAt", "expiresAt")
      VALUES
        (${randomUUID()}, ${email}, ${hashAuthToken(signupToken)}, ${codeHash}, ${passwordHash},
         ${dto.firstName}, ${dto.lastName}, ${dto.phone ?? null}, 0, 1, ${DB_NOW}, ${DB_NOW},
         ${DB_NOW} + make_interval(secs => ${ttlSeconds}))
      ON CONFLICT ("email") DO UPDATE SET
        "signupTokenHash" = EXCLUDED."signupTokenHash",
        "passwordHash" = EXCLUDED."passwordHash",
        "firstName" = EXCLUDED."firstName",
        "lastName" = EXCLUDED."lastName",
        "phone" = EXCLUDED."phone",
        "codeHash" = CASE WHEN ${SEND_ALLOWED} THEN EXCLUDED."codeHash" ELSE "pending_signups"."codeHash" END,
        "attempts" = CASE WHEN ${SEND_ALLOWED} THEN 0 ELSE "pending_signups"."attempts" END,
        "expiresAt" = CASE WHEN ${SEND_ALLOWED} THEN EXCLUDED."expiresAt" ELSE "pending_signups"."expiresAt" END,
        "sendCount" = CASE WHEN ${SEND_ALLOWED}
          THEN (CASE WHEN ${WINDOW_ENDED} THEN 1 ELSE "pending_signups"."sendCount" + 1 END)
          ELSE "pending_signups"."sendCount" END,
        "windowStartedAt" = CASE WHEN ${SEND_ALLOWED} AND ${WINDOW_ENDED}
          THEN ${DB_NOW} ELSE "pending_signups"."windowStartedAt" END,
        "lastSentAt" = CASE WHEN ${SEND_ALLOWED} THEN ${DB_NOW} ELSE "pending_signups"."lastSentAt" END
      RETURNING ("codeHash" = ${codeHash}) AS "sent", "expiresAt"
    `);

    const row = rows[0];
    if (row?.sent) {
      await this.queueCode(email, code, row.expiresAt);
    }
    return { message: SIGNUP_CODE_SENT_MESSAGE, signupToken };
  }

  /**
   * Resend the code to the address of the sign-up that holds `signupToken`. Always answers the
   * same generic success. An unknown token, a send held back by the cooldown and one held back by
   * the hourly cap all look identical to a real send, so the answer never tells whether a token
   * (and so an address) belongs to a pending sign-up. The page keeps its own 60 s countdown.
   */
  async resend(signupToken: string): Promise<{ message: string }> {
    const tokenHash = hashAuthToken(signupToken);
    const found = await this.prisma.pendingSignup.findUnique({
      where: { signupTokenHash: tokenHash },
      select: { email: true },
    });
    if (!found) return { message: SIGNUP_CODE_SENT_MESSAGE };

    const code = generateSignupCode();
    const codeHash = hashSignupCode(this.key(), found.email, code);
    const ttlSeconds = SIGNUP_CODE_TTL_MS / 1000;

    const rows = await this.prisma.$queryRaw<{ expiresAt: Date }[]>(Prisma.sql`
      UPDATE "pending_signups" SET
        "codeHash" = ${codeHash},
        "attempts" = 0,
        "expiresAt" = ${DB_NOW} + make_interval(secs => ${ttlSeconds}),
        "sendCount" = CASE WHEN ${WINDOW_ENDED} THEN 1 ELSE "sendCount" + 1 END,
        "windowStartedAt" = CASE WHEN ${WINDOW_ENDED} THEN ${DB_NOW} ELSE "windowStartedAt" END,
        "lastSentAt" = ${DB_NOW}
      WHERE "signupTokenHash" = ${tokenHash} AND ${SEND_ALLOWED}
      RETURNING "expiresAt"
    `);
    // Held back by the cooldown or the hourly cap: nothing is sent, and the answer does not say so.
    if (rows.length === 0) return { message: SIGNUP_CODE_SENT_MESSAGE };
    await this.queueCode(found.email, code, rows[0].expiresAt);
    return { message: SIGNUP_CODE_SENT_MESSAGE };
  }

  /**
   * Check the code and, only if it is right, create the verified account and open the session in
   * one transaction. Attempts are reserved before the comparison, so parallel guesses cannot
   * exceed the cap.
   */
  async verify(
    signupToken: string,
    code: string,
    opts: { deviceLabel?: string | null } = {},
  ): Promise<LoginSessionResult> {
    const tokenHash = hashAuthToken(signupToken);
    const reserved = await this.prisma.$queryRaw<ReservedSignup[]>(Prisma.sql`
      UPDATE "pending_signups" SET "attempts" = "attempts" + 1
      WHERE "signupTokenHash" = ${tokenHash}
        AND "attempts" < ${SIGNUP_CODE_MAX_ATTEMPTS}
        AND "expiresAt" > ${DB_NOW}
        AND "codeHash" IS NOT NULL
      RETURNING "id", "email", "codeHash", "passwordHash", "firstName", "lastName", "phone"
    `);
    const row = reserved[0];
    if (!row || !signupCodeMatches(this.key(), row.email, code, row.codeHash)) {
      throw invalidCodeError();
    }
    return this.confirm(row, tokenHash, opts.deviceLabel ?? null);
  }

  private async confirm(
    row: ReservedSignup,
    tokenHash: string,
    deviceLabel: string | null,
  ): Promise<LoginSessionResult> {
    const confirmedAt = new Date();
    let sessionId = '';
    let refreshToken = '';
    let user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      phone: string | null;
      role: UserRole;
      status: UserStatus;
    };

    // The address can be taken between our check and our insert (the old register route, Google).
    // The transaction rolls back and the pending row comes back, so it is tried once more: the
    // second pass then sees the account and takes it over, or refuses if it is already confirmed.
    for (let attempt = 0; ; attempt += 1) {
      try {
        user = await this.prisma.$transaction(async (tx) => {
          // Consume first: a concurrent confirmation that already deleted the row wins, and this
          // one is refused without writing anything.
          const consumed = await tx.pendingSignup.deleteMany({
            where: { id: row.id, signupTokenHash: tokenHash },
          });
          if (consumed.count !== 1) throw invalidCodeError();

          const existing = await tx.user.findUnique({
            where: { email: row.email },
            select: {
              id: true,
              emailVerifiedAt: true,
              status: true,
              role: true,
            },
          });

          let account;
          if (existing) {
            if (!this.isTakeoverable(existing)) throw invalidCodeError();
            // An unconfirmed account left by the old register route: whoever set its password may
            // not own the address (TTW-179). Replace the password, revoke every session, drop links.
            account = await tx.user.update({
              where: { id: existing.id },
              data: {
                passwordHash: row.passwordHash,
                firstName: row.firstName,
                lastName: row.lastName,
                ...(row.phone ? { phone: row.phone } : {}),
                emailVerifiedAt: confirmedAt,
                lastLoginAt: confirmedAt,
              },
            });
            await this.authSession.revokeAllForUser(existing.id, tx);
            await tx.authToken.deleteMany({
              where: {
                userId: existing.id,
                tokenType: {
                  in: [
                    TokenType.PASSWORD_RESET,
                    TokenType.EMAIL_VERIFICATION,
                    TokenType.REFRESH,
                  ],
                },
              },
            });
          } else {
            account = await tx.user.create({
              data: {
                email: row.email,
                passwordHash: row.passwordHash,
                firstName: row.firstName,
                lastName: row.lastName,
                phone: row.phone,
                role: UserRole.CUSTOMER,
                status: UserStatus.ACTIVE,
                emailVerifiedAt: confirmedAt,
                lastLoginAt: confirmedAt,
              },
            });
          }

          const created = await this.authSession.createSession(
            account.id,
            AuthSurface.CUSTOMER,
            { deviceLabel, tx },
          );
          sessionId = created.session.id;
          refreshToken = created.refreshToken;

          // Ids only: neither the code nor the token is recorded.
          await this.audit.log(
            {
              eventName: 'auth.signup.confirmed',
              action: AuditAction.APPROVE,
              entityType: 'User',
              entityId: account.id,
              actorUserId: account.id,
              actorRole: account.role,
              after: {
                emailVerifiedAt: confirmedAt,
                authSurface: AuthSurface.CUSTOMER,
                sessionId,
                tookOverUnconfirmedAccount: existing !== null,
              },
              note: 'Sign-up confirmed with an emailed code',
            },
            tx,
          );
          return account;
        });
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          if (attempt === 0) continue;
          throw invalidCodeError();
        }
        throw error;
      }
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      surface: AuthSurface.CUSTOMER,
      sid: sessionId,
    };
    this.observability.recordAuthLogin({ outcome: 'success' });
    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    };
  }

  /**
   * Queue the code email. If the queue refuses, give the send back (so the person can ask again
   * at once) but still answer generically. No address and no code in the log line.
   */
  private async queueCode(
    email: string,
    code: string,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await this.mailQueue.add(
        JOB_SIGNUP_CODE_EMAIL,
        { to: email, code, expiresAt: expiresAt.toISOString() },
        AUTH_LINK_JOB_OPTIONS,
      );
    } catch {
      this.logger.warn('Could not queue a sign-up code email');
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "pending_signups" SET
          "sendCount" = GREATEST("sendCount" - 1, 0),
          "lastSentAt" = "lastSentAt" - make_interval(secs => ${SIGNUP_RESEND_COOLDOWN_SECONDS + 1})
        WHERE "email" = ${email}
      `);
    }
  }
}
