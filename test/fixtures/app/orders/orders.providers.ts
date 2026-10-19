import type { Provider } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { OrdersService } from './orders.service.js';
import { FakePaymentGateway, PAYMENT_GATEWAY } from './payment.js';

export const ORDERS_PROVIDERS: Provider[] = [
  OrdersService,
  { provide: PAYMENT_GATEWAY, useClass: FakePaymentGateway },
  { provide: 'CLOCK', useFactory: (config: ConfigService) => () => `${config.prefix}${Date.now()}`, inject: [ConfigService] },
  { provide: 'LEGACY_ORDERS', useExisting: OrdersService },
];
