import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { HealthService } from './shared/health.js';

@Controller()
export class AppController {
  constructor(
    private readonly app: AppService,
    private readonly health: HealthService,
  ) {}

  @Get()
  hello() {
    return 'ok';
  }
}
