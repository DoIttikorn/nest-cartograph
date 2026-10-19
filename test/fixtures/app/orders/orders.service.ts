import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import type { WrapperType } from '../wrapper.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment.js';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(forwardRef(() => UsersService)) private readonly users: WrapperType<UsersService>,
    @Inject(PAYMENT_GATEWAY) private readonly payments: PaymentGateway,
    @Optional() @Inject('AUDIT') private readonly audit?: unknown,
  ) {}
}
