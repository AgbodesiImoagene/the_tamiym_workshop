import { assertAddressDeliverable } from './address-deliverability';

describe('assertAddressDeliverable (TTW-221 LGA required)', () => {
  const activeState = { isActive: true, lgas: [{ id: 'any' }] };
  const code = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      return (e as { getResponse: () => { code: string } }).getResponse().code;
    }
    return null;
  };

  it('asks for an LGA when a Nigerian address in a state with LGAs has none', () => {
    expect(
      code(() =>
        assertAddressDeliverable({
          countryCode: 'NG',
          stateCode: 'LA',
          lgaId: null,
          geoState: activeState,
        }),
      ),
    ).toBe('ADDRESS_LGA_REQUIRED');
  });

  it('does not ask when the state has no active LGA', () => {
    expect(
      code(() =>
        assertAddressDeliverable({
          countryCode: 'NG',
          stateCode: 'LA',
          lgaId: null,
          geoState: { isActive: true, lgas: [] },
        }),
      ),
    ).toBeNull();
  });

  it('does not ask a non-Nigerian address or one with no state code', () => {
    expect(
      code(() =>
        assertAddressDeliverable({
          countryCode: 'GH',
          stateCode: 'LA',
          lgaId: null,
          geoState: activeState,
        }),
      ),
    ).toBeNull();
    expect(
      code(() =>
        assertAddressDeliverable({
          countryCode: 'NG',
          stateCode: null,
          lgaId: null,
          geoState: null,
        }),
      ),
    ).toBeNull();
  });

  it('accepts an address that has an active LGA', () => {
    expect(
      code(() =>
        assertAddressDeliverable({
          countryCode: 'NG',
          stateCode: 'LA',
          lgaId: 'lga-1',
          geoState: activeState,
          lga: { isActive: true },
        }),
      ),
    ).toBeNull();
  });

  it('still refuses a deactivated state or LGA first', () => {
    expect(
      code(() =>
        assertAddressDeliverable({
          countryCode: 'NG',
          stateCode: 'LA',
          lgaId: null,
          geoState: { isActive: false, lgas: [{ id: 'x' }] },
        }),
      ),
    ).toBe('ADDRESS_STATE_NOT_DELIVERABLE');
    expect(
      code(() =>
        assertAddressDeliverable({
          countryCode: 'NG',
          stateCode: 'LA',
          lgaId: 'lga-1',
          geoState: activeState,
          lga: { isActive: false },
        }),
      ),
    ).toBe('ADDRESS_STATE_NOT_DELIVERABLE');
  });
});
