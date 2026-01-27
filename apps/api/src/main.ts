import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Cookie parser middleware
  app.use(cookieParser());

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
  await app.listen(port);
  const logger = app.get(Logger);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger documentation: http://localhost:${port}/docs`);
}
bootstrap();
