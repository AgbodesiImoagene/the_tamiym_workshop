import { toPaystackTransferReference } from './paystack-transfer-reference';

describe('toPaystackTransferReference', () => {
  it('lowercases and strips invalid characters', () => {
    expect(toPaystackTransferReference('Payout-ABC_123-XYZ!!!')).toBe(
      'payout-abc_123-xyz',
    );
  });

  it('pads short keys to 16 characters', () => {
    expect(toPaystackTransferReference('short')).toBe('short00000000000');
  });

  it('truncates to 50 characters', () => {
    const long = `payout-${'a'.repeat(60)}`;
    expect(toPaystackTransferReference(long)).toHaveLength(50);
  });
});
