import { roundToMinor, roundToDisplayGranularity } from './currency-rounding';

describe('currency-rounding', () => {
  describe('roundToMinor', () => {
    it('rounds NGN to 2 decimal places (100 minor per major)', () => {
      expect(roundToMinor(50.126, 'NGN')).toBe(50.13);
      expect(roundToMinor(50.124, 'NGN')).toBe(50.12);
    });

    it('uses HALF_EVEN for NGN (2.5 → 2, 3.5 → 4)', () => {
      // 0.025 with step 0.01: units=2.5, half-even → 2
      expect(roundToMinor(0.025, 'NGN')).toBe(0.02);
      // 0.035: units=3.5, half-even → 4
      expect(roundToMinor(0.035, 'NGN')).toBe(0.04);
    });
  });

  describe('roundToDisplayGranularity', () => {
    it('rounds NGN total to nearest 100 by default', () => {
      expect(roundToDisplayGranularity(10457, 'NGN')).toBe(10500); // 104.57 → 105
      expect(roundToDisplayGranularity(10450, 'NGN')).toBe(10400); // half-even: 104.5 → 104 (even)
      expect(roundToDisplayGranularity(10550, 'NGN')).toBe(10600);
    });
  });

  describe('unknown currency', () => {
    it('falls back to default (100 minor, HALF_EVEN, granularity 1)', () => {
      expect(roundToMinor(1.555, 'XXX')).toBe(1.56); // half-even 1.555 → 1.56
      expect(roundToDisplayGranularity(99.4, 'XXX')).toBe(99); // granularity 1 → whole number
    });
  });
});
