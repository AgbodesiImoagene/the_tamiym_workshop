import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObservabilityService } from '../observability/observability.service';
import type {
  PaystackTransferProvider,
  BankItem,
  ResolveAccountResult,
  TransferResult,
} from './paystack-provider.interface';
import { toPaystackTransferReference } from './paystack-transfer-reference';

const PAYSTACK_BASE = 'https://api.paystack.co';

@Injectable()
export class PaystackTransferProviderService implements PaystackTransferProvider {
  constructor(
    private config: ConfigService,
    private observability: ObservabilityService,
  ) {}

  private getSecret(): string {
    const key = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!key) throw new Error('Paystack not configured');
    return key;
  }

  async listBanks(): Promise<BankItem[]> {
    return this.observability.startSpan('paystack.banks.list', {}, async () => {
      const res = await fetch(
        `${PAYSTACK_BASE}/bank?country=nigeria&perPage=100`,
        {
          headers: { Authorization: `Bearer ${this.getSecret()}` },
        },
      );
      const data = (await res.json()) as {
        status?: boolean;
        data?: { name: string; code: string; id?: number }[];
      };
      if (!data.status || !Array.isArray(data.data)) return [];
      return data.data.map((b) => ({ code: b.code, name: b.name }));
    });
  }

  async resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolveAccountResult | null> {
    return this.observability.startSpan(
      'paystack.account.resolve',
      { 'paystack.bank_code': bankCode },
      async () => {
        const params = new URLSearchParams({
          account_number: accountNumber,
          bank_code: bankCode,
        });
        const res = await fetch(`${PAYSTACK_BASE}/bank/resolve?${params}`, {
          headers: { Authorization: `Bearer ${this.getSecret()}` },
        });
        const data = (await res.json()) as {
          status?: boolean;
          data?: {
            account_name: string;
            account_number: string;
            bank_id: number;
          };
        };
        if (!data.status || !data.data) return null;
        return {
          accountName: data.data.account_name,
          accountNumber: data.data.account_number,
          bankCode,
        };
      },
    );
  }

  async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<string> {
    return this.observability.startSpan(
      'paystack.transfer_recipient.create',
      { 'paystack.bank_code': params.bankCode },
      async () => {
        const res = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.getSecret()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'nuban',
            name: params.name,
            account_number: params.accountNumber,
            bank_code: params.bankCode,
          }),
        });
        const data = (await res.json()) as {
          status?: boolean;
          data?: { recipient_code: string };
          message?: string;
        };
        if (!res.ok || !data.status || !data.data?.recipient_code) {
          throw new Error(
            data.message ?? 'Failed to create transfer recipient',
          );
        }
        return data.data.recipient_code;
      },
    );
  }

  async transfer(params: {
    amountKobo: number;
    recipientCode: string;
    reason: string;
    idempotencyKey?: string;
  }): Promise<TransferResult> {
    return this.observability.startSpan(
      'paystack.transfer.create',
      { 'paystack.amount_kobo': params.amountKobo },
      async () => {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.getSecret()}`,
          'Content-Type': 'application/json',
        };
        const reference = params.idempotencyKey
          ? toPaystackTransferReference(params.idempotencyKey)
          : undefined;
        if (reference) {
          headers['Idempotency-Key'] = reference;
        }
        const res = await fetch(`${PAYSTACK_BASE}/transfer`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source: 'balance',
            amount: params.amountKobo,
            recipient: params.recipientCode,
            reason: params.reason,
            ...(reference ? { reference } : {}),
          }),
        });
        const data = (await res.json()) as {
          status?: boolean;
          data?: { reference?: string; transfer_code?: string };
          message?: string;
        };
        if (!res.ok || !data.status) {
          return {
            reference: null,
            success: false,
            message: data.message ?? 'Transfer failed',
          };
        }
        return {
          reference:
            data.data?.reference ??
            data.data?.transfer_code ??
            reference ??
            null,
          success: true,
        };
      },
    );
  }
}
