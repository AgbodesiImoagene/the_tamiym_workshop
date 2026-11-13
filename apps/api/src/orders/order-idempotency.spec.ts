import { computeOrderRequestFingerprint } from './order-idempotency';

/**
 * TTW-037 review finding 6: an idempotency key replays an order only for the same
 * request content (lines, delivery address, campaign).
 */
describe('computeOrderRequestFingerprint', () => {
  const address = {
    id: 'addr-1',
    recipientName: 'Ada',
    phone: '+2348012345678',
    addressLine1: '1 Allen Avenue',
    addressLine2: null,
    city: 'Ikeja',
    state: 'Lagos',
    postalCode: null,
    country: 'Nigeria',
    landmark: null,
    instructions: null,
  };
  const items = [
    { variantId: 'var-1', designId: 'des-1', quantity: 1 },
    { variantId: 'var-2', quantity: 3 },
  ];
  const base = { campaignId: null, address, items };

  it('is a versioned hex digest', () => {
    expect(computeOrderRequestFingerprint(base)).toMatch(/^v1:[0-9a-f]{64}$/);
  });

  it('does not depend on line order or on an omitted versus null design', () => {
    expect(
      computeOrderRequestFingerprint({
        ...base,
        items: [
          { variantId: 'var-2', designId: null, quantity: 3 },
          { variantId: 'var-1', designId: 'des-1', quantity: 1 },
        ],
      }),
    ).toBe(computeOrderRequestFingerprint(base));
  });

  it('changes when a quantity, a design or a line changes', () => {
    const fp = computeOrderRequestFingerprint(base);
    expect(
      computeOrderRequestFingerprint({
        ...base,
        items: [items[0], { ...items[1], quantity: 4 }],
      }),
    ).not.toBe(fp);
    expect(
      computeOrderRequestFingerprint({
        ...base,
        items: [{ ...items[0], designId: 'des-2' }, items[1]],
      }),
    ).not.toBe(fp);
    expect(
      computeOrderRequestFingerprint({ ...base, items: [items[0]] }),
    ).not.toBe(fp);
  });

  it('changes when the delivery address content changes under the same id', () => {
    expect(
      computeOrderRequestFingerprint({
        ...base,
        address: { ...address, city: 'Lekki' },
      }),
    ).not.toBe(computeOrderRequestFingerprint(base));
  });

  it('changes with the campaign', () => {
    expect(
      computeOrderRequestFingerprint({ ...base, campaignId: 'camp-1' }),
    ).not.toBe(computeOrderRequestFingerprint(base));
  });

  describe('customer note (TTW-197)', () => {
    it('keeps the digest of a request without a note unchanged', () => {
      const fp = computeOrderRequestFingerprint(base);
      expect(
        computeOrderRequestFingerprint({ ...base, customerNote: null }),
      ).toBe(fp);
      expect(
        computeOrderRequestFingerprint({ ...base, customerNote: undefined }),
      ).toBe(fp);
      // Golden digest computed before the note existed: stored fingerprints stay valid.
      expect(fp).toBe(
        'v1:db3d1aeac06d85421cf8af201eb7d3a91b65541c33c28d6b22379b6db13f2a3a',
      );
    });

    it('changes when a note is added, removed or edited', () => {
      const none = computeOrderRequestFingerprint(base);
      const a = computeOrderRequestFingerprint({ ...base, customerNote: 'A' });
      const b = computeOrderRequestFingerprint({ ...base, customerNote: 'B' });
      expect(a).not.toBe(none);
      expect(a).not.toBe(b);
      expect(
        computeOrderRequestFingerprint({ ...base, customerNote: 'A' }),
      ).toBe(a);
    });
  });
});
