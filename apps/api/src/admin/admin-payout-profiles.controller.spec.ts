import { Test } from '@nestjs/testing';
import { PayoutProfileStatus } from '../generated/prisma/enums';
import { PayoutProfilesService } from '../fundraising/payout-profiles.service';
import { AdminPayoutProfilesController } from './admin-payout-profiles.controller';

describe('AdminPayoutProfilesController', () => {
  it('delegates status updates and returns a masked profile', async () => {
    const adminSetStatus = jest.fn().mockResolvedValue({
      id: 'p1',
      status: PayoutProfileStatus.VERIFIED,
      accountNumberMasked: '***6789',
    });
    const module = await Test.createTestingModule({
      controllers: [AdminPayoutProfilesController],
      providers: [
        {
          provide: PayoutProfilesService,
          useValue: { adminSetStatus },
        },
      ],
    }).compile();
    const controller = module.get(AdminPayoutProfilesController);
    await expect(
      controller.setStatus('p1', { status: PayoutProfileStatus.VERIFIED }),
    ).resolves.toEqual({
      id: 'p1',
      status: PayoutProfileStatus.VERIFIED,
      accountNumberMasked: '***6789',
    });
    expect(adminSetStatus).toHaveBeenCalledWith(
      'p1',
      PayoutProfileStatus.VERIFIED,
    );
  });
});
