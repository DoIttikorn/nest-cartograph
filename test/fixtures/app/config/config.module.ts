import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { CONFIG_OPTIONS, type ConfigOptions } from './constants.js';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(options: ConfigOptions): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG_OPTIONS, useValue: options }, ConfigService],
      exports: [ConfigService],
    };
  }
}
