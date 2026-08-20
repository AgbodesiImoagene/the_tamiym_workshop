import {
  fingerprintFinding,
  escapeCsvCell,
  windowKeyFor,
  lagosDayIso,
} from './reconciliation.util';
import {
  ReconciliationDomain,
  ReconciliationOutcome,
} from '../generated/prisma/enums';

describe('reconciliation.util', () => {
  it('builds stable fingerprints', () => {
    const a = fingerprintFinding({
      domain: ReconciliationDomain.PAYMENT,
      outcome: ReconciliationOutcome.MISMATCH,
      entityKey: 'payment:1',
    });
    const b = fingerprintFinding({
      domain: ReconciliationDomain.PAYMENT,
      outcome: ReconciliationOutcome.MISMATCH,
      entityKey: 'payment:1',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it('escapes CSV formula injection', () => {
    expect(escapeCsvCell('=cmd()')).toBe("'=cmd()");
    expect(escapeCsvCell('hello,world')).toBe('"hello,world"');
  });

  it('builds window keys in Lagos day', () => {
    expect(windowKeyFor('internal', '2026-08-20')).toBe('internal:2026-08-20');
    expect(lagosDayIso(new Date('2026-08-19T23:30:00.000Z'))).toBe(
      '2026-08-20',
    );
  });
});
