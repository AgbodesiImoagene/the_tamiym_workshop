import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Request } from 'express';
import { AppModule } from '../app.module';

export interface CreateApiApplicationOptions {
  /** When true, Nest buffers logs until a custom logger is attached (production bootstrap). */
  bufferLogs?: boolean;
}

/**
 * Shared HTTP pipeline configuration used by production bootstrap, OpenAPI
 * generation, and e2e harnesses. Keeps prefix, validation and body parsing
 * aligned with the mounted `/v1` surface.
 */
export function configureApiApplication(app: INestApplication): void {
  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

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

  app.setGlobalPrefix('v1');
}

/**
 * Create a Nest application for the real `AppModule` without listening.
 * Callers must invoke `init()` before route discovery and `close()` on exit.
 */
export async function createApiApplication(
  options: CreateApiApplicationOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: options.bufferLogs ?? false,
    bodyParser: false,
  });

  configureApiApplication(app);
  return app;
}
