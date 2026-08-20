import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './auth/decorators/public.decorator';
import { resolveApiRole } from './runtime/api-role';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Legacy combined health (kept for existing clients/tests).
   * Prefer `/v1/health/live` and `/v1/health/ready` for orchestration.
   */
  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Health check endpoint' })
  async getHealth() {
    const database = await this.checkDatabase();
    const redis = await this.checkRedis();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database,
      redis,
      role: resolveApiRole(),
      uptime: process.uptime(),
    };
  }

  @Get('health/live')
  @Public()
  @ApiOperation({
    summary: 'Liveness — process is up (no dependency checks)',
  })
  getLive() {
    return {
      status: 'ok',
      role: resolveApiRole(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  @Public()
  @ApiOperation({
    summary: 'Readiness — required dependencies are reachable',
  })
  async getReady() {
    const database = await this.checkDatabase();
    const redis = await this.checkRedis();
    const ready = database === 'connected' && redis === 'connected';
    const body = {
      status: ready ? 'ok' : 'not_ready',
      database,
      redis,
      role: resolveApiRole(),
      timestamp: new Date().toISOString(),
    };
    if (!ready) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  private async checkDatabase(): Promise<'connected' | 'disconnected'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  private async checkRedis(): Promise<'connected' | 'disconnected'> {
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = Number(this.config.get<string | number>('REDIS_PORT', 6379));
    const password = this.config.get<string>('REDIS_PASSWORD') || undefined;
    const db = Number(this.config.get<string | number>('REDIS_DB', 0));
    const client = new Redis({
      host,
      port,
      password,
      db,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
    });
    try {
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      return 'disconnected';
    } finally {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  }
}
