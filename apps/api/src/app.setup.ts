import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation';
import { APP_CONFIG } from './config/config.module';
import type { AppConfig } from './config/env';
import { ConfiguredIoAdapter } from './realtime/configured-io.adapter';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts and the integration tests so tests exercise the real HTTP pipeline. */
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);

  if (config.trustProxy > 0) (app as NestExpressApplication).set('trust proxy', config.trustProxy);
  app.setGlobalPrefix(API_PREFIX);
  // JSON API: a CSP only matters for HTML documents, which are served by the web host (and Swagger UI in dev).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    credentials: false,
    maxAge: 600,
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, config.corsOrigins));
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Nexora API')
        .setDescription(
          'Real-time operations platform API. All routes except auth/health require `Authorization: Bearer <accessToken>`. ' +
            'Errors always use the `ErrorResponseDto` envelope. Realtime events are delivered over Socket.IO (see docs/architecture).',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
  }
  return config;
}
