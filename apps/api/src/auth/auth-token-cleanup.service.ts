import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';
import { runWithRequestContext } from '../request-context/request-context.store';

/**
 * Scheduled task: delete expired rows from auth_tokens and stale auth_sessions
 * to curtail DB growth. Runs daily at 2:00 AM.
 * See https://docs.nestjs.com/techniques/task-scheduling
 */
@Injectable()
export class AuthTokenCleanupService {
  private readonly logger = new Logger(AuthTokenCleanupService.name);

  constructor(
    private prisma: PrismaService,
    private readonly observability: ObservabilityService,
  ) {}

  @Cron('0 2 * * *')
  async handleExpiredTokensCleanup() {
    const now = new Date();
    const revokedRetentionCutoff = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    return runWithRequestContext(
      {
        requestId: `cron:auth-token-cleanup:${now.toISOString()}`,
        source: 'CRON',
      },
      () =>
        this.observability.startSpan(
          'cron.auth.cleanup_tokens',
          {},
          async () => {
            const result = await this.prisma.authToken.deleteMany({
              where: { expiresAt: { lt: now } },
            });
            if (result.count > 0) {
              this.logger.log(`Deleted ${result.count} expired auth token(s)`);
            }

            const sessions = await this.prisma.authSession.deleteMany({
              where: {
                OR: [
                  { expiresAt: { lt: now } },
                  {
                    AND: [
                      { revokedAt: { not: null } },
                      { revokedAt: { lt: revokedRetentionCutoff } },
                    ],
                  },
                ],
              },
            });
            if (sessions.count > 0) {
              this.logger.log(
                `Deleted ${sessions.count} expired/revoked auth session(s)`,
              );
            }
          },
        ),
    );
  }
}
