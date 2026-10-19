import { Inject, Injectable } from '@nestjs/common';
import { CONFIG_OPTIONS, type ConfigOptions } from './constants.js';

@Injectable()
export class ConfigService {
  constructor(@Inject(CONFIG_OPTIONS) private readonly options: ConfigOptions) {}

  get prefix(): string {
    return this.options.prefix;
  }
}
