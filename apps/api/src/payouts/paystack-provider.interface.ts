/**
 * Minimal abstraction for Paystack transfer and recipient operations.
 * Allows swapping provider or mocking in tests.
 */
export interface TransferResult {
  reference: string | null;
  success: boolean;
  message?: string;
}

export interface ResolveAccountResult {
  accountName: string;
  accountNumber: string;
  bankCode: string;
}

export interface BankItem {
  code: string;
  name: string;
}

export interface PaystackTransferProvider {
  /** List Nigerian banks (for payout profile setup). */
  listBanks(): Promise<BankItem[]>;

  /** Resolve account name from account number + bank code. */
  resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolveAccountResult | null>;

  /** Create or get transfer recipient. Returns recipient_code. */
  createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<string>;

  /** Initiate transfer. */
  transfer(params: {
    amountKobo: number;
    recipientCode: string;
    reason: string;
    idempotencyKey?: string;
  }): Promise<TransferResult>;
}
