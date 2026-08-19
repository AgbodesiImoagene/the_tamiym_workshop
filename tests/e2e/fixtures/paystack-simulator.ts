/**
 * Local Paystack simulator for deterministic webhook delivery controls.
 * Ordinary CI must never call live Paystack; later tickets emit signed
 * charge.success / transfer events through this in-process stub.
 */
export type SimulatedWebhookEvent = {
  id: string;
  event: string;
  data: Record<string, unknown>;
  delayMs?: number;
  deliveredAt?: number;
};

export class PaystackSimulator {
  private readonly queue: SimulatedWebhookEvent[] = [];
  private readonly delivered: SimulatedWebhookEvent[] = [];
  private seq = 0;

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
    this.seq = 0;
  }
}

export const paystackSimulator = new PaystackSimulator();
