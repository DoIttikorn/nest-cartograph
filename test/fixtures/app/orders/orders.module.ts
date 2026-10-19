import { forwardRef, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { ORDERS_PROVIDERS } from './orders.providers.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [forwardRef(() => UsersModule)],
  providers: ORDERS_PROVIDERS,
  exports: [OrdersService],
})
export class OrdersModule {}
