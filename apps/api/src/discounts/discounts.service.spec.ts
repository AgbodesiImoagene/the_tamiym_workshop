import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscountsService } from './discounts.service';

describe('DiscountsService active locks', () => {
  let service: DiscountsService;
  let prisma: {
    discount: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
    };
    discountCampaign: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    discountProduct: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    discountVariant: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    discountActiveLock: {
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      discount: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      discountCampaign: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      discountProduct: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      discountVariant: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      discountActiveLock: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'lock-1' }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscountsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DiscountsService);
  });

  it('creates ACTIVE campaign discount and writes exclusivity lock', async () => {
    prisma.discount.create.mockResolvedValue({ id: 'd1' });
    prisma.discount.findUnique.mockResolvedValue({
      id: 'd1',
      type: 'PERCENTAGE',
      scope: 'CAMPAIGN',
      status: 'ACTIVE',
      campaigns: [{ campaignId: 'c1' }],
      products: [],
      variants: [],
    });

    await service.create({
      type: 'PERCENTAGE',
      scope: 'CAMPAIGN',
      status: 'ACTIVE',
      valuePercent: 10,
      campaignIds: ['c1'],
    });

    expect(prisma.discountActiveLock.deleteMany).toHaveBeenCalledWith({
      where: { discountId: 'd1' },
    });
    expect(prisma.discountActiveLock.create).toHaveBeenCalledWith({
      data: {
        discountId: 'd1',
        subjectKind: 'CAMPAIGN',
        subjectId: 'c1',
        currencyKey: '*',
      },
    });
  });

  it('maps unique lock conflicts to BadRequestException', async () => {
    prisma.discount.create.mockResolvedValue({ id: 'd2' });
    prisma.discount.findUnique.mockResolvedValue({
      id: 'd2',
      type: 'PERCENTAGE',
      scope: 'CAMPAIGN',
      status: 'ACTIVE',
      campaigns: [{ campaignId: 'c1' }],
      products: [],
      variants: [],
    });
    prisma.discountActiveLock.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create({
        type: 'PERCENTAGE',
        scope: 'CAMPAIGN',
        status: 'ACTIVE',
        valuePercent: 5,
        campaignIds: ['c1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps PCT/FIXED trigger conflict messages to BadRequestException', async () => {
    prisma.discount.create.mockResolvedValue({ id: 'd3' });
    prisma.discount.findUnique.mockResolvedValue({
      id: 'd3',
      type: 'FIXED',
      scope: 'CAMPAIGN',
      status: 'ACTIVE',
      campaigns: [{ campaignId: 'c1' }],
      products: [],
      variants: [],
    });
    prisma.discountActiveLock.create.mockRejectedValue(
      new Error(
        'FIXED discount conflicts with active PERCENTAGE lock for subject CAMPAIGN:c1',
      ),
    );

    await expect(
      service.create({
        type: 'FIXED',
        scope: 'CAMPAIGN',
        status: 'ACTIVE',
        valueAmount: 500,
        currency: 'NGN',
        campaignIds: ['c1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears locks when status becomes INACTIVE on update', async () => {
    prisma.discount.findUnique.mockResolvedValue({
      id: 'd1',
      type: 'PERCENTAGE',
      scope: 'CAMPAIGN',
      status: 'ACTIVE',
      currency: null,
      campaigns: [{ campaignId: 'c1' }],
      products: [],
      variants: [],
    });
    prisma.discount.update.mockResolvedValue({});

    await service.update('d1', { status: 'INACTIVE' });

    expect(prisma.discountActiveLock.deleteMany).toHaveBeenCalledWith({
      where: { discountId: 'd1' },
    });
    expect(prisma.discountActiveLock.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when updating missing discount', async () => {
    prisma.discount.findUnique.mockResolvedValue(null);
    await expect(
      service.update('missing', { status: 'INACTIVE' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('syncActiveLocks rejects FIXED without currency and rethrows unknown errors', async () => {
    const tx = {
      discountActiveLock: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
      },
    };

    await expect(
      (
        service as unknown as {
          syncActiveLocks: (
            tx: unknown,
            input: Record<string, unknown>,
          ) => Promise<void>;
        }
      ).syncActiveLocks(tx, {
        discountId: 'd-x',
        type: 'FIXED',
        scope: 'CAMPAIGN',
        status: 'ACTIVE',
        currency: null,
        campaignIds: ['c1'],
        productIds: [],
        variantIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    tx.discountActiveLock.create.mockRejectedValue(new Error('unexpected db'));
    await expect(
      (
        service as unknown as {
          syncActiveLocks: (
            tx: unknown,
            input: Record<string, unknown>,
          ) => Promise<void>;
        }
      ).syncActiveLocks(tx, {
        discountId: 'd-y',
        type: 'PERCENTAGE',
        scope: 'ORDER',
        status: 'ACTIVE',
        currency: null,
        campaignIds: [],
        productIds: [],
        variantIds: [],
      }),
    ).rejects.toThrow('unexpected db');
  });
});
