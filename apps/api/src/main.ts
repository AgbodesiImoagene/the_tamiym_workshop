import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Request } from 'express';
import { AppModule } from './app.module';
import {
  shutdownOpenTelemetry,
  startOpenTelemetry,
} from './observability/otel';

async function bootstrap() {
  await startOpenTelemetry();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  // Raw body capture for webhook signature verification (must run before JSON parser)
  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());

  // Trust the first hop from a reverse proxy so that req.protocol and
  // req.ip reflect the original client values, not the proxy address.
  // Adjust to a number or IP list if the deployment topology requires stricter control.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Use pino logger
  app.useLogger(app.get(Logger));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('v1');

  // Swagger/OpenAPI configuration
  const config = new DocumentBuilder()
    .setTitle('Tamiym Workshop API')
    .setDescription('API documentation for Tamiym Workshop platform')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addCookieAuth('access_token', {
      type: 'http',
      in: 'Cookie',
      scheme: 'Bearer',
    })
    .addTag('Health', 'Health check endpoints')
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User management endpoints')
    .addTag('Products', 'Product catalog endpoints')
    .addTag('Orders', 'Order management endpoints')
    .addTag('Fundraising', 'Fundraising campaign endpoints')
    .addTag('Admin', 'Admin-only endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3003',
    ],
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  app.enableShutdownHooks();
  await app.listen(port);
  const logger = app.get(Logger);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger documentation: http://localhost:${port}/docs`);
}

void bootstrap().catch(async (error) => {
  await shutdownOpenTelemetry();
  throw error;
});
