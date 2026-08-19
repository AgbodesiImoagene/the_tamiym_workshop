import {
  asScalarString,
  payloadAsRecord,
} from './notification-outbox-delivery.helpers';

describe('notification-outbox-delivery.helpers', () => {
  describe('payloadAsRecord', () => {
    it('returns the object payload when present', () => {
      expect(payloadAsRecord({ a: 1 })).toEqual({ a: 1 });
    });

    it('returns an empty object for nullish or non-object payloads', () => {
      expect(payloadAsRecord(null)).toEqual({});
      expect(payloadAsRecord(undefined)).toEqual({});
      expect(payloadAsRecord('x')).toEqual({});
      expect(payloadAsRecord(3)).toEqual({});
    });
  });

  describe('asScalarString', () => {
    it('returns strings as-is', () => {
      expect(asScalarString('hello')).toBe('hello');
    });

    it('stringifies numbers and booleans', () => {
      expect(asScalarString(42)).toBe('42');
      expect(asScalarString(true)).toBe('true');
    });

    it('falls back for objects, arrays, null, and undefined', () => {
      expect(asScalarString({ a: 1 }, 'fallback')).toBe('fallback');
      expect(asScalarString(['x'], 'fallback')).toBe('fallback');
      expect(asScalarString(null, 'fallback')).toBe('fallback');
      expect(asScalarString(undefined)).toBe('');
    });
  });
});
