import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaystackListedTransaction = {
  id: number;
  reference: string;
  status: string;
  amountKobo: number;
  currency: string;
};

export type PaystackListedRefund = {
  id: number;
  status: string;
  amountKobo: number;
  currency: string;
  transactionReference: string | null;
};

export type PaystackListedTransfer = {
  id: number;
  reference: string;
  status: string;
  amountKobo: number;
  currency: string;
};

export type PaystackListResult<T> = {
  complete: boolean;
  items: T[];
  errorSummary?: string;
  pagesFetched: number;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const TIMEOUT_MS = 20_000;

/**
 * Paginated Paystack read client for provider reconciliation (TTW-015).
 * Fail-closed: any network/HTTP/parse error marks the list incomplete.
 */
@Injectable()
export class PaystackReconciliationClient {
  constructor(private readonly config: ConfigService) {}

  async listTransactions(params: {
    fromIso: string;
    toIso: string;
  }): Promise<PaystackListResult<PaystackListedTransaction>> {
    return this.paginate(
      '/transaction',
      params,
      (row: Record<string, unknown>): PaystackListedTransaction | null => {
        if (typeof row.reference !== 'string' || row.id == null) return null;
        return {
          id: Number(row.id),
          reference: row.reference,
          status: typeof row.status === 'string' ? row.status : '',
          amountKobo: Number(row.amount ?? 0),
          currency: typeof row.currency === 'string' ? row.currency : 'NGN',
        };
      },
    );
  }

  async listRefunds(params: {
    fromIso: string;
    toIso: string;
  }): Promise<PaystackListResult<PaystackListedRefund>> {
    return this.paginate(
      '/refund',
      params,
      (row: Record<string, unknown>): PaystackListedRefund | null => {
        if (row.id == null) return null;
        const txn = row.transaction;
        const transactionReference =
          typeof txn === 'object' && txn != null && 'reference' in txn
            ? String((txn as { reference?: string }).reference ?? '')
            : typeof row.transaction_reference === 'string'
              ? row.transaction_reference
              : null;
        return {
          id: Number(row.id),
          status: typeof row.status === 'string' ? row.status : '',
          amountKobo: Number(row.amount ?? 0),
          currency: typeof row.currency === 'string' ? row.currency : 'NGN',
          transactionReference: transactionReference || null,
        };
      },
    );
  }

  async listTransfers(params: {
    fromIso: string;
    toIso: string;
  }): Promise<PaystackListResult<PaystackListedTransfer>> {
    return this.paginate(
      '/transfer',
      params,
      (row: Record<string, unknown>): PaystackListedTransfer | null => {
        if (typeof row.reference !== 'string' || row.id == null) return null;
        return {
          id: Number(row.id),
          reference: row.reference,
          status: typeof row.status === 'string' ? row.status : '',
          amountKobo: Number(row.amount ?? 0),
          currency: typeof row.currency === 'string' ? row.currency : 'NGN',
        };
      },
    );
  }

  private async paginate<T>(
    path: string,
    params: { fromIso: string; toIso: string },
    mapRow: (row: Record<string, unknown>) => T | null,
  ): Promise<PaystackListResult<T>> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      return {
        complete: false,
        items: [],
        pagesFetched: 0,
        errorSummary: 'PAYSTACK_SECRET_KEY not configured',
      };
    }

    const items: T[] = [];
    let pagesFetched = 0;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url = new URL(`https://api.paystack.co${path}`);
      url.searchParams.set('perPage', String(PAGE_SIZE));
      url.searchParams.set('page', String(page));
      url.searchParams.set('from', params.fromIso.slice(0, 10));
      url.searchParams.set('to', params.toIso.slice(0, 10));

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${secretKey}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        return {
          complete: false,
          items,
          pagesFetched,
          errorSummary:
            error instanceof Error
              ? error.message.slice(0, 300)
              : 'Paystack network error',
        };
      }

      if (!response.ok) {
        return {
          complete: false,
          items,
          pagesFetched,
          errorSummary: `Paystack ${path} HTTP ${response.status}`,
        };
      }

      const body = (await response.json().catch(() => null)) as {
        status?: boolean;
        data?: Record<string, unknown>[];
        meta?: { page?: number; pageCount?: number; next?: string | null };
        message?: string;
      } | null;

      if (!body?.status || !Array.isArray(body.data)) {
        return {
          complete: false,
          items,
          pagesFetched,
          errorSummary: body?.message ?? `Invalid Paystack ${path} payload`,
        };
      }

      pagesFetched += 1;
      let skippedMalformed = 0;
      for (const row of body.data) {
        const mapped = mapRow(row);
        if (mapped) items.push(mapped);
        else skippedMalformed += 1;
      }
      if (skippedMalformed > 0) {
        return {
          complete: false,
          items,
          pagesFetched,
          errorSummary: `Paystack ${path} returned ${skippedMalformed} malformed row(s) on page ${page}`,
        };
      }

      const pageCount = body.meta?.pageCount ?? page;
      const hasNext =
        body.meta?.next != null ||
        (body.meta?.page != null && body.meta.page < pageCount);
      if (!hasNext || body.data.length < PAGE_SIZE) {
        return { complete: true, items, pagesFetched };
      }
    }

    return {
      complete: false,
      items,
      pagesFetched,
      errorSummary: `Paystack ${path} exceeded max pages (${MAX_PAGES})`,
    };
  }
}
