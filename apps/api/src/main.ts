import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { JsonLogger } from './common/logging/json-logger';
import { ConfigError, loadDotEnv, parseConfig } from './config/env';

async function bootstrap() {
  loadDotEnv();
  // Validate before Nest boots so misconfiguration fails fast with a readable message.
  let logFormat: 'pretty' | 'json';
  try {
    logFormat = parseConfig(process.env).logFormat;
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const app = await NestFactory.create(AppModule, { logger: logFormat === 'json' ? new JsonLogger() : undefined });
  const config = configureApp(app);
  await app.listen(config.port);
  Logger.log(
    `API listening on :${config.port} (${config.nodeEnv})${config.swaggerEnabled ? ' — docs at /api/docs' : ''}`,
    'Bootstrap',
  );
}

void bootstrap();
