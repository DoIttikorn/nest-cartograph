import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { OrdersService } from '../orders/orders.service.js';
import type { WrapperType } from '../wrapper.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => OrdersService)) private readonly orders: WrapperType<OrdersService>,
  ) {}
}
