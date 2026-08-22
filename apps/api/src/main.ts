import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import {
  shutdownOpenTelemetry,
  startOpenTelemetry,
} from './observability/otel';
import { createApiApplication } from './openapi/application.factory';
import { createOpenApiDocument } from './openapi/swagger-document';

async function bootstrap() {
  await startOpenTelemetry();

  const app = await createApiApplication({ bufferLogs: true });

  // Use pino logger
  app.useLogger(app.get(Logger));

  const document = createOpenApiDocument(app);
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
