// Adapter boundary: no external collection is enabled merely by supplying keys.
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: {
    orderId: string;
    amountPaise: number;
    currency: "INR";
    idempotencyKey: string;
  }): Promise<{ reference: string; status: string }>;
  verifyWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<{
    eventId: string;
    reference: string;
    amountPaise: number;
    status: string;
  }>;
  reconcile(
    reference: string,
  ): Promise<{ amountPaise: number; status: string }>;
  refund(input: {
    reference: string;
    amountPaise: number;
    idempotencyKey: string;
  }): Promise<{ reference: string; status: string }>;
}
export class DisabledOnlinePayments implements PaymentProvider {
  readonly name = "DISABLED";
  async createPayment(_input: {
    orderId: string;
    amountPaise: number;
    currency: "INR";
    idempotencyKey: string;
  }): Promise<never> {
    throw new Error(
      "Online payment collection requires a configured, verified provider implementation",
    );
  }
  async verifyWebhook(_rawBody: Buffer, _signature: string): Promise<never> {
    throw new Error("No payment webhook provider configured");
  }
  async reconcile(_reference: string): Promise<never> {
    throw new Error("No online provider to reconcile");
  }
  async refund(_input: {
    reference: string;
    amountPaise: number;
    idempotencyKey: string;
  }): Promise<never> {
    throw new Error(
      "Provider refund unavailable; use audited manual refund workflow",
    );
  }
}
