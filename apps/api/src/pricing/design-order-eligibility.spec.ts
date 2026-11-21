import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { ModerationStatus } from '../generated/prisma/enums';
import { assertDesignsOrderableBy as assertRaw } from './design-order-eligibility';

// The mocks only implement the two reads the rule makes.
const assertDesignsOrderableBy = (
  prisma: unknown,
  userId: string,
  items: Array<{ variantId: string; designId?: string | null }>,
) => assertRaw(prisma as Parameters<typeof assertRaw>[0], userId, items);

/** TTW-239: one rule for "this user may quote or order this design on this variant". */
describe('assertDesignsOrderableBy', () => {
  const design = (over: Record<string, unknown> = {}) => ({
    id: 'design-1',
    userId: 'user-1',
    productId: 'prod-1',
    moderationStatus: ModerationStatus.APPROVED,
    ...over,
  });
  const make = (d: unknown, v: unknown = { productId: 'prod-1' }) => ({
    design: { findUnique: jest.fn().mockResolvedValue(d) },
    productVariant: { findUnique: jest.fn().mockResolvedValue(v) },
  });
  const line = { variantId: 'var-1', designId: 'design-1' };

  it('does nothing and reads nothing for lines without a design', async () => {
    const prisma = make(null);
    await assertDesignsOrderableBy(prisma, 'user-1', [
      { variantId: 'var-1' },
      { variantId: 'var-1', designId: null },
      { variantId: 'var-1', designId: '' },
    ]);
    expect(prisma.design.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a missing design with 400', async () => {
    await expect(
      assertDesignsOrderableBy(make(null), 'user-1', [line]),
    ).rejects.toThrow(new BadRequestException('Design design-1 not found'));
  });

  it("refuses another customer's design with 403", async () => {
    await expect(
      assertDesignsOrderableBy(make(design({ userId: 'other' })), 'user-1', [
        line,
      ]),
    ).rejects.toThrow(
      new ForbiddenException('Access denied: design does not belong to you'),
    );
  });

  it('refuses a missing variant with 400', async () => {
    await expect(
      assertDesignsOrderableBy(make(design(), null), 'user-1', [line]),
    ).rejects.toThrow(new BadRequestException('Variant var-1 not found'));
  });

  it('refuses a design of another product with 400', async () => {
    await expect(
      assertDesignsOrderableBy(
        make(design(), { productId: 'prod-2' }),
        'user-1',
        [line],
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Design does not belong to the same product as variant var-1',
      ),
    );
  });

  it('refuses a REJECTED design with 400 and code DESIGN_REJECTED', async () => {
    const err = (await assertDesignsOrderableBy(
      make(design({ moderationStatus: ModerationStatus.REJECTED })),
      'user-1',
      [line],
    ).catch((e: HttpException) => e)) as HttpException;
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'DESIGN_REJECTED' });
  });

  it('checks ownership before moderation, so another user learns nothing', async () => {
    await expect(
      assertDesignsOrderableBy(
        make(
          design({
            userId: 'other',
            moderationStatus: ModerationStatus.REJECTED,
          }),
        ),
        'user-1',
        [line],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ModerationStatus.PENDING,
    ModerationStatus.FLAGGED,
    ModerationStatus.APPROVED,
  ])('accepts a %s design (client answer Q28)', async (moderationStatus) => {
    await expect(
      assertDesignsOrderableBy(make(design({ moderationStatus })), 'user-1', [
        line,
      ]),
    ).resolves.toBeUndefined();
  });

  it('reads a design and a variant once, however many lines use them', async () => {
    const prisma = make(design());
    await assertDesignsOrderableBy(prisma, 'user-1', [
      line,
      line,
      { variantId: 'var-1', designId: 'design-1' },
    ]);
    expect(prisma.design.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.productVariant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('refuses the whole request when only one of several lines is at fault', async () => {
    const prisma = {
      design: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) =>
            Promise.resolve(
              where.id === 'design-ok'
                ? design({ id: 'design-ok' })
                : design({ id: 'design-bad', userId: 'other' }),
            ),
          ),
      },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({ productId: 'prod-1' }),
      },
    };
    await expect(
      assertDesignsOrderableBy(prisma, 'user-1', [
        { variantId: 'var-1', designId: 'design-ok' },
        { variantId: 'var-1', designId: 'design-bad' },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
