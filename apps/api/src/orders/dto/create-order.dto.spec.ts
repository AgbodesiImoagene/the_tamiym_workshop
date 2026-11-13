import { ValidationPipe } from '@nestjs/common';
import { CreateOrderDto } from './create-order.dto';

/**
 * TTW-197: the optional order note goes through the same pipe options as the
 * running application (whitelist, forbidNonWhitelisted, implicit conversion).
 */
describe('CreateOrderDto customerNote (TTW-197)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const base = {
    shippingAddressId: 'addr-1',
    items: [{ variantId: 'var-1', quantity: 1 }],
  };

  const run = (extra: Record<string, unknown>) =>
    pipe.transform(
      { ...base, ...extra },
      { type: 'body', metatype: CreateOrderDto },
    ) as Promise<CreateOrderDto>;

  it('accepts an order without a note', async () => {
    const dto = await run({});
    expect(dto.customerNote).toBeUndefined();
  });

  it('accepts a short note and exactly 500 characters', async () => {
    expect(
      (await run({ customerNote: 'Pack the hoodies apart' })).customerNote,
    ).toBe('Pack the hoodies apart');
    const max = 'a'.repeat(500);
    expect((await run({ customerNote: max })).customerNote).toBe(max);
  });

  it('refuses 501 characters', async () => {
    await expect(run({ customerNote: 'a'.repeat(501) })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('counts the limit after trimming', async () => {
    const dto = await run({ customerNote: `  ${'a'.repeat(500)}  ` });
    expect(dto.customerNote).toBe('a'.repeat(500));
  });

  it('refuses values that are not strings, without converting them', async () => {
    for (const value of [123, true, ['note'], { text: 'note' }]) {
      await expect(run({ customerNote: value })).rejects.toMatchObject({
        status: 400,
      });
    }
  });

  it('trims whitespace around the note', async () => {
    expect((await run({ customerNote: '  hello \n' })).customerNote).toBe(
      'hello',
    );
  });

  it('turns a blank note, or null, into null', async () => {
    expect((await run({ customerNote: '' })).customerNote).toBeNull();
    expect((await run({ customerNote: '  \n\t ' })).customerNote).toBeNull();
    expect((await run({ customerNote: null })).customerNote).toBeNull();
  });

  it('keeps the validation message free of the submitted text', async () => {
    const secret = 'x'.repeat(501) + 'SECRET-NOTE-TEXT';
    const err = await run({ customerNote: secret }).catch((e: unknown) => e);
    expect(JSON.stringify(err)).not.toContain('SECRET-NOTE-TEXT');
  });
});
