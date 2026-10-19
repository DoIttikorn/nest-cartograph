import { Injectable } from '@nestjs/common';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentGateway {
  charge(amount: number): Promise<void>;
}

@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  async charge(): Promise<void> {}
}
