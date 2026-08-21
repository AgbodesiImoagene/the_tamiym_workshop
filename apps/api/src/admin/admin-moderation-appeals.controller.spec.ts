import { Test, TestingModule } from '@nestjs/testing';
import { AdminModerationAppealsController } from './admin-moderation-appeals.controller';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import { ResolveAppealDto } from '../moderation/dto/resolve-appeal.dto';
import {
  ModerationAppealStatus,
  ModerationStatus,
} from '../generated/prisma/enums';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';

describe('AdminModerationAppealsController', () => {
  let controller: AdminModerationAppealsController;
  const decisions = {
    listAppealsForAdmin: jest.fn(),
    getAppealForAdmin: jest.fn(),
    resolveAppeal: jest.fn(),
  };

  const admin = { id: 'admin-1' } as RequestUser;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminModerationAppealsController],
      providers: [{ provide: ModerationDecisionService, useValue: decisions }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AdminModerationAppealsController);
  });

  it('lists appeals with optional status filter', () => {
    decisions.listAppealsForAdmin.mockReturnValue([{ id: 'a1' }]);
    expect(controller.list(ModerationAppealStatus.PENDING)).toEqual([
      { id: 'a1' },
    ]);
    expect(decisions.listAppealsForAdmin).toHaveBeenCalledWith(
      ModerationAppealStatus.PENDING,
    );
  });

  it('gets appeal detail', async () => {
    decisions.getAppealForAdmin.mockResolvedValue({ id: 'a1' });
    await expect(controller.get('a1')).resolves.toEqual({ id: 'a1' });
  });

  it('resolves an appeal', async () => {
    const dto: ResolveAppealDto = {
      resolution: 'OVERTURNED',
      status: ModerationStatus.APPROVED,
      notes: 'internal only',
      customerExplanation: 'Your content was approved after appeal review.',
    };
    decisions.resolveAppeal.mockResolvedValue({ appeal: { id: 'a1' } });
    await expect(controller.resolve(admin, 'a1', dto)).resolves.toEqual({
      appeal: { id: 'a1' },
    });
    expect(decisions.resolveAppeal).toHaveBeenCalledWith('admin-1', 'a1', dto);
  });
});
