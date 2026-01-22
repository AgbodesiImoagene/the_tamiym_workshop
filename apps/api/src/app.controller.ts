import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Health check endpoint' })
  async getHealth() {
    const dbStatus = await this.checkDatabase();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      uptime: process.uptime(),
    };
  }

  private async checkDatabase(): Promise<'connected' | 'disconnected'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }
}
