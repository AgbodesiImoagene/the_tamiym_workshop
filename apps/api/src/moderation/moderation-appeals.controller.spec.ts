import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ModerationAppealsController } from './moderation-appeals.controller';
import { ModerationDecisionService } from './moderation-decision.service';
import { CreateAppealDto } from './dto/create-appeal.dto';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

describe('ModerationAppealsController', () => {
  let controller: ModerationAppealsController;
  const decisions = {
    listAppealsForOwner: jest.fn(),
    getAppealForOwner: jest.fn(),
    createAppeal: jest.fn(),
    withdrawAppeal: jest.fn(),
  };

  const user = { id: 'u1' } as RequestUser;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModerationAppealsController],
      providers: [{ provide: ModerationDecisionService, useValue: decisions }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ModerationAppealsController);
  });

  it('lists appeals for the current user', () => {
    decisions.listAppealsForOwner.mockReturnValue([{ id: 'a1' }]);
    expect(controller.list(user)).toEqual([{ id: 'a1' }]);
    expect(decisions.listAppealsForOwner).toHaveBeenCalledWith('u1');
  });

  it('gets one appeal', async () => {
    decisions.getAppealForOwner.mockResolvedValue({ id: 'a1' });
    await expect(controller.get(user, 'a1')).resolves.toEqual({ id: 'a1' });
  });

  it('creates an appeal', async () => {
    const dto: CreateAppealDto = {
      decisionId: 'd1',
      statement: 'Please reconsider this decision.',
    };
    decisions.createAppeal.mockResolvedValue({ id: 'a1' });
    await expect(controller.create(user, dto)).resolves.toEqual({ id: 'a1' });
    expect(decisions.createAppeal).toHaveBeenCalledWith(
      'u1',
      'd1',
      dto.statement,
    );
  });

  it('withdraws an appeal', async () => {
    decisions.withdrawAppeal.mockResolvedValue({
      id: 'a1',
      status: 'WITHDRAWN',
    });
    await expect(controller.withdraw(user, 'a1')).resolves.toEqual({
      id: 'a1',
      status: 'WITHDRAWN',
    });
  });
});
