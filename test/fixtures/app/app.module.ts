import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from './config/config.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { SHARED_IMPORTS } from './shared/health.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [ConfigModule.forRoot({ prefix: 'atlas-' }), UsersModule, OrdersModule, ...SHARED_IMPORTS],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
