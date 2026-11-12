import { ShippingAdminService } from './shipping-admin.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * TTW-199: the admin geo lists keep deactivated states and LGAs so an admin
 * can still see them. The customer-facing lists (GeoService) stay active-only.
 */
describe('ShippingAdminService geo lists', () => {
  const lagos = { code: 'LA', name: 'Lagos', isActive: true };
  const closed = { code: 'ZZ', name: 'Closed', isActive: false };
  const lgas = [
    { id: 'l1', stateCode: 'ZZ', name: 'Active LGA', isActive: true },
    { id: 'l2', stateCode: 'ZZ', name: 'Off LGA', isActive: false },
  ];

  function build() {
    const prisma = {
      geoState: {
        findMany: jest.fn().mockResolvedValue([lagos, closed]),
        findUnique: jest.fn(),
      },
      geoLga: { findMany: jest.fn().mockResolvedValue(lgas) },
    };
    const service = new ShippingAdminService(
      prisma as unknown as PrismaService,
    );
    return { prisma, service };
  }

  it('lists states without filtering on isActive, and keeps the flag', async () => {
    const { prisma, service } = build();
    const result = await service.listStates();
    const args = prisma.geoState.findMany.mock.calls[0][0] as {
      where?: Record<string, unknown>;
    };
    expect(args.where ?? {}).not.toHaveProperty('isActive');
    expect(result).toEqual([lagos, closed]);
  });

  it('lists the LGAs of a deactivated state, including deactivated LGAs', async () => {
    const { prisma, service } = build();
    prisma.geoState.findUnique.mockResolvedValue({ code: 'ZZ' });
    const result = await service.listLgas('ZZ');
    const args = prisma.geoLga.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({ stateCode: 'ZZ' });
    expect(result).toEqual(lgas);
  });

  it('still returns an empty list for an unknown state', async () => {
    const { prisma, service } = build();
    prisma.geoState.findUnique.mockResolvedValue(null);
    await expect(service.listLgas('NOPE')).resolves.toEqual([]);
    expect(prisma.geoLga.findMany).not.toHaveBeenCalled();
  });
});
