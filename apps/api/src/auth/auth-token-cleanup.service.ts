import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Scheduled task: delete expired rows from auth_tokens to curtail DB growth.
 * Runs daily at 2:00 AM. See https://docs.nestjs.com/techniques/task-scheduling
 */
@Injectable()
export class AuthTokenCleanupService {
  private readonly logger = new Logger(AuthTokenCleanupService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('0 2 * * *')
  async handleExpiredTokensCleanup() {
    const result = await this.prisma.authToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Deleted ${result.count} expired auth token(s)`);
    }
  }
}
