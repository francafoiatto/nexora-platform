import { Global, Module } from '@nestjs/common';
import { type AppConfig, parseConfig } from './env';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => parseConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
