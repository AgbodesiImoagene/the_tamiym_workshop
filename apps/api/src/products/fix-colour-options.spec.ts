import { assertTestDatabaseName, fixColourOptions } from './fix-colour-options';

interface FakeOption {
  id: string;
  productId: string;
  code: string;
  product: { name: string; options: Array<{ id: string; code: string }> };
  values: Array<{
    id: string;
    valueCode: string;
    displayName: string;
    metadata: unknown;
  }>;
}

const HEX: Record<string, string> = { black: '#000000', green: '#008000' };

function option(
  values: FakeOption['values'],
  siblings: Array<{ id: string; code: string }> = [],
): FakeOption {
  return {
    id: 'opt-1',
    productId: 'prod-1',
    code: 'colour',
    product: {
      name: 'Quote Product',
      options: [{ id: 'opt-1', code: 'colour' }, ...siblings],
    },
    values,
  };
}

function value(displayName: string, metadata: unknown = null, id = 'val-1') {
  return { id, valueCode: displayName.toUpperCase(), displayName, metadata };
}

function setup(options: FakeOption[]) {
  const prisma = {
    productOption: {
      findMany: jest.fn().mockResolvedValue(options),
      update: jest.fn().mockReturnValue('option-write'),
    },
    productOptionValue: {
      update: jest.fn().mockReturnValue('value-write'),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const findHex = (name: string) => HEX[name.trim().toLowerCase()];
  return { prisma, deps: { prisma, findHex } };
}

describe('fixColourOptions (TTW-266)', () => {
  it('lists what it would change and writes nothing without apply', async () => {
    const { prisma, deps } = setup([option([value('Black')])]);

    const report = await fixColourOptions(deps, { apply: false });

    expect(report.options).toEqual([
      expect.objectContaining({
        optionId: 'opt-1',
        productName: 'Quote Product',
        skipped: false,
        filled: [{ valueId: 'val-1', name: 'Black', hex: '#000000' }],
        unknown: [],
      }),
    ]);
    expect(prisma.productOption.update).not.toHaveBeenCalled();
    expect(prisma.productOptionValue.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('renames the option and fills the missing hex, keeping other metadata', async () => {
    const { prisma, deps } = setup([
      option([value('Black', { pantone: 'Black C' })]),
    ]);

    await fixColourOptions(deps, { apply: true });

    expect(prisma.productOption.update).toHaveBeenCalledWith({
      where: { id: 'opt-1' },
      data: { code: 'color' },
    });
    expect(prisma.productOptionValue.update).toHaveBeenCalledWith({
      where: { id: 'val-1' },
      data: { metadata: { pantone: 'Black C', hex: '#000000' } },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps a hex that is already valid', async () => {
    const { prisma, deps } = setup([
      option([value('Black', { hex: '#111111' })]),
    ]);

    const report = await fixColourOptions(deps, { apply: true });

    expect(report.options[0].filled).toEqual([]);
    expect(prisma.productOptionValue.update).not.toHaveBeenCalled();
    expect(prisma.productOption.update).toHaveBeenCalled();
  });

  it('replaces an invalid hex', async () => {
    const { deps } = setup([option([value('Green', { hex: 'green' })])]);

    const report = await fixColourOptions(deps, { apply: false });

    expect(report.options[0].filled).toEqual([
      { valueId: 'val-1', name: 'Green', hex: '#008000' },
    ]);
  });

  it('falls back to the value code when the display name is not a colour', async () => {
    const { deps } = setup([
      option([
        {
          id: 'val-1',
          valueCode: 'BLACK',
          displayName: 'Classic',
          metadata: null,
        },
      ]),
    ]);

    const report = await fixColourOptions(deps, { apply: false });

    expect(report.options[0].filled[0].hex).toBe('#000000');
  });

  it('reports a name it does not know instead of guessing a hex', async () => {
    const { prisma, deps } = setup([option([value('Sunset')])]);

    const report = await fixColourOptions(deps, { apply: true });

    expect(report.options[0].unknown).toEqual([
      { valueId: 'val-1', name: 'Sunset' },
    ]);
    expect(prisma.productOptionValue.update).not.toHaveBeenCalled();
  });

  it('leaves a product that already has a color option untouched', async () => {
    const { prisma, deps } = setup([
      option([value('Black')], [{ id: 'opt-2', code: 'Color' }]),
    ]);

    const report = await fixColourOptions(deps, { apply: true });

    expect(report.options[0]).toMatchObject({ skipped: true, filled: [] });
    expect(prisma.productOption.update).not.toHaveBeenCalled();
    expect(prisma.productOptionValue.update).not.toHaveBeenCalled();
  });

  it('looks only for the British spelling, within the given products', async () => {
    const { prisma, deps } = setup([]);

    await fixColourOptions(deps, { apply: false, productIds: ['prod-9'] });

    expect(prisma.productOption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          code: { equals: 'colour', mode: 'insensitive' },
          productId: { in: ['prod-9'] },
        },
      }),
    );
  });
});

describe('assertTestDatabaseName (TTW-266)', () => {
  const url = (rest: string) => `postgresql://user:pass@localhost:5432/${rest}`;

  it.each([
    'tamiym_workshop_test',
    'tamiym_workshop_test_ttw266?schema=public',
    'E2E_database',
  ])('accepts the database "%s" and returns its name', (rest) => {
    expect(assertTestDatabaseName(url(rest))).toBe(rest.split('?')[0]);
  });

  it.each([
    url('tamiym_workshop'),
    url('tamiym_workshop?application_name=latest'),
    url('tamiym_workshop?schema=test'),
    'postgresql://user:contest@localhost:5432/tamiym_workshop',
    'postgresql://e2e:pass@db.latest.invalid:5432/tamiym_workshop',
    url(''),
    'not a url test',
  ])('refuses %s', (databaseUrl) => {
    expect(() => assertTestDatabaseName(databaseUrl)).toThrow(
      /test or e2e database/,
    );
  });

  it('cannot be bypassed by the environment', () => {
    const previous = process.env.ALLOW_NON_TEST_DATABASE_SEED;
    process.env.ALLOW_NON_TEST_DATABASE_SEED = 'true';
    try {
      expect(process.env.NODE_ENV).toBe('test');
      expect(() => assertTestDatabaseName(url('tamiym_workshop'))).toThrow();
    } finally {
      if (previous === undefined) {
        delete process.env.ALLOW_NON_TEST_DATABASE_SEED;
      } else {
        process.env.ALLOW_NON_TEST_DATABASE_SEED = previous;
      }
    }
  });
});
