import { Injectable } from '@nestjs/common';
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';

interface HttpRequestMetric {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

interface OutcomeMetric {
  outcome: 'success' | 'failure' | 'denied';
}

export type PaymentInitiationMetricOutcome =
  | 'success'
  | 'failure'
  | 'denied'
  | 'created'
  | 'reused'
  | 'reconciled'
  | 'blocked';

@Injectable()
export class ObservabilityService {
  private readonly tracer = trace.getTracer('tamiym-api');
  private readonly meter = metrics.getMeter('tamiym-api');

  private readonly httpRequests = this.meter.createCounter(
    'http_server_requests_total',
    {
      description: 'Count of handled HTTP requests.',
    },
  );

  private readonly httpRequestDuration = this.meter.createHistogram(
    'http_server_request_duration_ms',
    {
      description: 'HTTP request duration in milliseconds.',
      unit: 'ms',
    },
  );

  private readonly authLogins = this.meter.createCounter('auth_login_total', {
    description: 'Authentication attempts grouped by outcome.',
  });

  private readonly authThrottles = this.meter.createCounter(
    'auth_throttle_total',
    {
      description:
        'Auth rate-limit decisions grouped by surface, bucket, and outcome.',
    },
  );

  private readonly paymentInitiations = this.meter.createCounter(
    'payment_initiation_total',
    {
      description:
        'Payment initiation outcomes (created, reused, reconciled, blocked, failure).',
    },
  );

  private readonly refunds = this.meter.createCounter('refunds_total', {
    description: 'Refund attempts grouped by outcome.',
  });

  private readonly refundSettlements = this.meter.createCounter(
    'refund_settlement_total',
    {
      description:
        'Paystack refund lifecycle outcomes (initiated, settled, duplicate, failed, stale, unmatched).',
    },
  );

  private readonly payoutRuns = this.meter.createCounter('payout_runs_total', {
    description: 'Payout run events grouped by outcome.',
  });

  private readonly payouts = this.meter.createCounter('payouts_total', {
    description: 'Payout events grouped by outcome.',
  });

  private readonly webhookEvents = this.meter.createCounter(
    'webhook_events_total',
    {
      description: 'Webhook events grouped by event name and outcome.',
    },
  );

  private readonly chargeSettlements = this.meter.createCounter(
    'charge_settlement_total',
    {
      description:
        'Paystack charge settlement outcomes (settled, duplicate no-op, rejected).',
    },
  );

  private readonly inventoryMovements = this.meter.createCounter(
    'inventory_movement_total',
    {
      description:
        'Inventory lifecycle outcomes by kind (reserve/release/consume) and outcome.',
    },
  );

  private readonly payoutTransferEvents = this.meter.createCounter(
    'payout_transfer_event_total',
    {
      description:
        'Paystack transfer webhook outcomes (applied, duplicate, stale).',
    },
  );

  private readonly queueJobs = this.meter.createCounter('queue_jobs_total', {
    description: 'Queue jobs grouped by queue, job, and outcome.',
  });

  private readonly queueJobDuration = this.meter.createHistogram(
    'queue_job_duration_ms',
    {
      description: 'Queue job execution duration in milliseconds.',
      unit: 'ms',
    },
  );

  private readonly mediaVirusScans = this.meter.createCounter(
    'media_virus_scan_total',
    {
      description:
        'Media malware scan outcomes (clean, infected, failed, unavailable).',
    },
  );

  private readonly mediaFetchDenied = this.meter.createCounter(
    'media_fetch_denied_total',
    {
      description: 'Remote media fetch denials grouped by reason.',
    },
  );

  getCurrentTraceId(): string | undefined {
    return trace.getActiveSpan()?.spanContext().traceId;
  }

  async startSpan<T>(
    name: string,
    attributes: Record<string, string | number | boolean | undefined>,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined) {
          span.setAttribute(key, value);
        }
      }

      try {
        return await callback();
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  recordHttpRequest(metric: HttpRequestMetric): void {
    const attributes = {
      method: metric.method,
      route: metric.route,
      status_code: metric.statusCode,
    };

    this.httpRequests.add(1, attributes);
    this.httpRequestDuration.record(metric.durationMs, attributes);
  }

  recordAuthLogin(metric: OutcomeMetric): void {
    this.authLogins.add(1, { outcome: metric.outcome });
  }

  recordAuthThrottle(metric: {
    surface: 'CUSTOMER' | 'ADMIN';
    bucket: string;
    outcome: 'allowed' | 'limited' | 'unavailable';
  }): void {
    this.authThrottles.add(1, {
      surface: metric.surface,
      bucket: metric.bucket,
      outcome: metric.outcome,
    });
  }

  recordPaymentInitiation(metric: {
    outcome: PaymentInitiationMetricOutcome;
  }): void {
    this.paymentInitiations.add(1, { outcome: metric.outcome });
  }

  recordRefund(metric: OutcomeMetric): void {
    this.refunds.add(1, { outcome: metric.outcome });
  }

  recordRefundSettlement(
    outcome:
      | 'initiated'
      | 'reused'
      | 'settled'
      | 'duplicate'
      | 'failed'
      | 'stale'
      | 'unmatched'
      | 'status_updated'
      | 'provider_transient'
      | 'provider_rejected'
      | 'rejected',
  ): void {
    this.refundSettlements.add(1, { outcome });
  }

  recordPayoutRun(metric: OutcomeMetric): void {
    this.payoutRuns.add(1, { outcome: metric.outcome });
  }

  recordPayout(metric: OutcomeMetric): void {
    this.payouts.add(1, { outcome: metric.outcome });
  }

  recordWebhook(
    eventName: string,
    outcome: 'success' | 'failure' | 'denied',
  ): void {
    this.webhookEvents.add(1, { event: eventName, outcome });
  }

  recordChargeSettlement(outcome: 'settled' | 'duplicate' | 'rejected'): void {
    this.chargeSettlements.add(1, { outcome });
  }

  recordInventoryMovement(
    kind: 'reserve' | 'release' | 'consume',
    outcome: 'applied' | 'duplicate' | 'rejected',
  ): void {
    this.inventoryMovements.add(1, { kind, outcome });
  }

  recordPayoutTransferEvent(outcome: 'applied' | 'duplicate' | 'stale'): void {
    this.payoutTransferEvents.add(1, { outcome });
  }

  recordQueueJob(params: {
    queue: string;
    jobName: string;
    outcome: 'success' | 'failure';
    durationMs: number;
  }): void {
    const attributes = {
      queue: params.queue,
      job: params.jobName,
      outcome: params.outcome,
    };

    this.queueJobs.add(1, attributes);
    this.queueJobDuration.record(params.durationMs, attributes);
  }

  recordMediaVirusScan(metric: {
    outcome: 'clean' | 'infected' | 'failed' | 'unavailable';
  }): void {
    this.mediaVirusScans.add(1, { outcome: metric.outcome });
  }

  recordMediaFetchDenied(metric: { reason: string }): void {
    this.mediaFetchDenied.add(1, { reason: metric.reason });
  }
}
