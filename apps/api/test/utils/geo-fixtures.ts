import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * TTW-221: a Nigerian address in a state that has active LGAs must carry one,
 * or quotes and orders refuse it. Fixtures that save a Lagos address use this
 * to get an active Lagos LGA (created if the test database does not have it).
 */
export async function ensureLga(
  prisma: PrismaService,
  stateCode = 'LA',
  name = 'Ikeja',
) {
  return prisma.geoLga.upsert({
    where: { stateCode_name: { stateCode, name } },
    update: { isActive: true },
    create: { stateCode, name, isActive: true },
  });
}
