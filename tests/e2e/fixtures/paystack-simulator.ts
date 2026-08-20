/**
 * Local Paystack simulator for deterministic webhook delivery controls.
 * Ordinary CI must never call live Paystack; later tickets emit signed
 * charge.success / transfer events through this in-process stub.
 *
 * TTW-012: `initializeTransaction` is idempotent per reference so payment-retry
 * journeys can assert a single provider session.
 */
export type SimulatedWebhookEvent = {
  id: string;
  event: string;
  data: Record<string, unknown>;
  delayMs?: number;
  deliveredAt?: number;
};

export type SimulatedInitializeResult = {
  authorizationUrl: string;
  reference: string;
  accessCode: string;
  outcome: 'created' | 'reused';
};

export type SimulatedRefundResult = {
  providerRefundId: string;
  transactionReference: string;
  amountMajor: number;
  outcome: 'created' | 'reused';
};

export class PaystackSimulator {
  private readonly queue: SimulatedWebhookEvent[] = [];
  private readonly delivered: SimulatedWebhookEvent[] = [];
  private readonly sessions = new Map<string, SimulatedInitializeResult>();
  private readonly refunds = new Map<string, SimulatedRefundResult>();
  private seq = 0;
  initializeCalls = 0;
  refundCreateCalls = 0;

  /**
   * Simulate transaction/initialize. Same reference returns the same session
   * (mirrors server-side attempt reuse / Idempotency-Key).
   */
  initializeTransaction(reference: string): SimulatedInitializeResult {
    this.initializeCalls += 1;
    const existing = this.sessions.get(reference);
    if (existing) {
      return { ...existing, outcome: 'reused' };
    }
    const created: SimulatedInitializeResult = {
      authorizationUrl: `https://checkout.paystack.test/${reference}`,
      reference,
      accessCode: `ac_${reference.slice(-8)}`,
      outcome: 'created',
    };
    this.sessions.set(reference, created);
    return created;
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Simulate refund create. Same transaction+amount returns the same refund id
   * (mirrors admin idempotency / TTW-013 single provider refund).
   */
  createRefund(
    transactionReference: string,
    amountMajor: number,
  ): SimulatedRefundResult {
    this.refundCreateCalls += 1;
    const key = `${transactionReference}:${amountMajor}`;
    const existing = this.refunds.get(key);
    if (existing) {
      return { ...existing, outcome: 'reused' };
    }
    this.seq += 1;
    const created: SimulatedRefundResult = {
      providerRefundId: String(900_000 + this.seq),
      transactionReference,
      amountMajor,
      outcome: 'created',
    };
    this.refunds.set(key, created);
    return created;
  }

  refundCount(): number {
    return this.refunds.size;
  }

  enqueue(
    event: string,
    data: Record<string, unknown>,
    options?: { delayMs?: number; duplicate?: boolean }
  ): SimulatedWebhookEvent[] {
    const created: SimulatedWebhookEvent[] = [];
    const pushOne = () => {
      this.seq += 1;
      const item: SimulatedWebhookEvent = {
        id: `sim_${this.seq}`,
        event,
        data: { ...data },
        delayMs: options?.delayMs,
      };
      this.queue.push(item);
      created.push(item);
    };
    pushOne();
    if (options?.duplicate) pushOne();
    return created;
  }

  /** Deliver next queued event (optionally skipping delay for tests). */
  deliverNext(options?: { ignoreDelay?: boolean }): SimulatedWebhookEvent | null {
    const next = this.queue.shift();
    if (!next) return null;
    if (next.delayMs && next.delayMs > 0 && !options?.ignoreDelay) {
      this.queue.unshift(next);
      return null;
    }
    const delivered = { ...next, deliveredAt: Date.now() };
    this.delivered.push(delivered);
    return delivered;
  }

  flushIgnoringDelays(): SimulatedWebhookEvent[] {
    const out: SimulatedWebhookEvent[] = [];
    while (this.queue.length > 0) {
      const item = this.deliverNext({ ignoreDelay: true });
      if (item) out.push(item);
    }
    return out;
  }

  getDelivered(): readonly SimulatedWebhookEvent[] {
    return this.delivered;
  }

  getPending(): readonly SimulatedWebhookEvent[] {
    return this.queue;
  }

  reset(): void {
    this.queue.length = 0;
    this.delivered.length = 0;
    this.sessions.clear();
    this.refunds.clear();
    this.seq = 0;
    this.initializeCalls = 0;
    this.refundCreateCalls = 0;
  }
}

export const paystackSimulator = new PaystackSimulator();
