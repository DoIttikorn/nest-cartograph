import { forwardRef, Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [forwardRef(() => OrdersModule)],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
