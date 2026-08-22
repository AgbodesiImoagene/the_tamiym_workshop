import { randomUUID } from 'node:crypto';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { trace } from '@opentelemetry/api';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { createThrottlerModuleOptions } from './config/throttler-redis.factory';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt/jwt.guard';
import { CsrfGuard } from './auth/guards/csrf/csrf.guard';
import { UsersModule } from './users/users.module';
import { AddressesModule } from './addresses/addresses.module';
import { BulkPricingModule } from './bulk-pricing/bulk-pricing.module';
import { DesignsModule } from './designs/designs.module';
import { DesignAssetsModule } from './design-assets/design-assets.module';
import { DiscountsModule } from './discounts/discounts.module';
import { FundraisingModule } from './fundraising/fundraising.module';
import { InventoryModule } from './inventory/inventory.module';
import { MailModule } from './mail/mail.module';
import { MediaModule } from './media/media.module';
import { OrdersModule } from './orders/orders.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ProductsModule } from './products/products.module';
import { ShippingModule } from './shipping/shipping.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { ObservabilityModule } from './observability/observability.module';
import { HttpMetricsInterceptor } from './observability/http-metrics.interceptor';
import { RequestContextInterceptor } from './request-context/request-context.interceptor';
import { RequestContextMiddleware } from './request-context/request-context.middleware';
import { getRequestContext } from './request-context/request-context.store';
import { validateEnv } from './config/env-validation';
import { SchedulerRoleBootstrap } from './runtime/scheduler-role.bootstrap';
import { PrivacyModule } from './privacy/privacy.module';
import { OrganizerModule } from './organizer/organizer.module';
import { NotificationsModule } from './notifications/notifications.module';
import { redactPublicDesignShareUrl } from './designs/design-share.redact';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'test'
          ? ['.env.test', '.env.local', '.env']
          : ['.env.local', '.env'],
      validate: validateEnv,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string | number>('REDIS_PORT', 6379)),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: Number(config.get<string | number>('REDIS_DB', 0)),
        },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Keep Nest Throttler in-memory under test to avoid an extra unmanaged
        // Redis client leaking open handles across e2e suites. Auth abuse
        // limits still use Redis via AuthRateLimitService (TTW-023).
        if (process.env.NODE_ENV === 'test') {
          return {
            throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
          };
        }
        return createThrottlerModuleOptions(config);
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        genReqId: (
          req: { headers: Record<string, unknown>; id?: string | number },
          res: { setHeader: (name: string, value: string) => void },
        ) => {
          const requestIdHeader = req.headers['x-request-id'];
          const requestId =
            (typeof requestIdHeader === 'string' && requestIdHeader.trim()) ||
            (req.id != null ? String(req.id) : undefined) ||
            randomUUID();

          req.id = requestId;
          res.setHeader('x-request-id', requestId);
          return requestId;
        },
        transport:
          process.env.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                },
              }
            : undefined,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.currentPassword',
            'req.body.newPassword',
            'req.body.token',
            'req.body.refresh_token',
          ],
          censor: '[REDACTED]',
        },
        customProps: () => {
          const context = getRequestContext();
          return {
            requestId: context?.requestId,
            traceId: trace.getActiveSpan()?.spanContext().traceId,
            actorUserId: context?.actorUserId,
            actorRole: context?.actorRole,
          };
        },
        serializers: {
          req: (req: Request) => ({
            id: req.id,
            method: req.method,
            // TTW-026: design-share bearers live in the path; never log them.
            url: redactPublicDesignShareUrl(req.url),
          }),
          res: (res: Response) => ({
            statusCode: res.statusCode,
          }),
        },
      } as never,
    }),
    AddressesModule,
    AdminModule,
    AnalyticsModule,
    AuditModule,
    AuthModule,
    BulkPricingModule,
    DesignAssetsModule,
    DesignsModule,
    DiscountsModule,
    FundraisingModule,
    InventoryModule,
    MailModule,
    MediaModule,
    OrdersModule,
    PayoutsModule,
    PrivacyModule,
    OrganizerModule,
    NotificationsModule,
    ProductsModule,
    ShippingModule,
    ObservabilityModule,
    PrismaModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SchedulerRoleBootstrap,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // TTW-020: runs after JwtAuthGuard (which already rejects surface
    // mismatches on cookie-authenticated requests); enforces Origin
    // allowlist + double-submit CSRF token on cookie-authenticated mutations.
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes({
      path: '*path',
      method: RequestMethod.ALL,
    });
  }
}
