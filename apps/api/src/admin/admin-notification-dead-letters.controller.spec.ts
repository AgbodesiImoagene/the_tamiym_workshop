import { Test, TestingModule } from '@nestjs/testing';
import { AdminNotificationDeadLettersController } from './admin-notification-dead-letters.controller';
import { NotificationDeadLetterService } from '../notifications/notification-dead-letter.service';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('AdminNotificationDeadLettersController', () => {
  let controller: AdminNotificationDeadLettersController;
  const deadLetters = {
    listDeadLetters: jest.fn(),
    getDeadLetter: jest.fn(),
    acknowledgeDeadLetter: jest.fn(),
    replayDeadLetter: jest.fn(),
    replayDeadLettersBulk: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminNotificationDeadLettersController],
      providers: [
        { provide: NotificationDeadLetterService, useValue: deadLetters },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AdminNotificationDeadLettersController);
  });

  it('lists dead letters', async () => {
    deadLetters.listDeadLetters.mockResolvedValue({ items: [] });
    await controller.list();
    expect(deadLetters.listDeadLetters).toHaveBeenCalled();
  });

  it('gets dead letter detail', async () => {
    deadLetters.getDeadLetter.mockResolvedValue({ id: 'dl-1' });
    await controller.get('dl-1');
    expect(deadLetters.getDeadLetter).toHaveBeenCalledWith('dl-1');
  });

  it('acknowledges dead letter', async () => {
    deadLetters.acknowledgeDeadLetter.mockResolvedValue({ id: 'dl-1' });
    await controller.acknowledge('dl-1', { id: 'admin-1' } as never, {
      note: 'reviewed',
    });
    expect(deadLetters.acknowledgeDeadLetter).toHaveBeenCalledWith(
      'dl-1',
      'admin-1',
      'reviewed',
    );
  });

  it('replays dead letter', async () => {
    deadLetters.replayDeadLetter.mockResolvedValue({ generation: 2 });
    await controller.replay('dl-1', { id: 'admin-1' } as never, {
      reason: 'provider recovered',
    });
    expect(deadLetters.replayDeadLetter).toHaveBeenCalledWith(
      'dl-1',
      'admin-1',
      'provider recovered',
    );
  });

  it('bulk replays dead letters', async () => {
    deadLetters.replayDeadLettersBulk.mockResolvedValue({ results: [] });
    await controller.bulkReplay({ id: 'admin-1' } as never, {
      ids: ['dl-1'],
      reason: 'batch retry',
    });
    expect(deadLetters.replayDeadLettersBulk).toHaveBeenCalledWith(
      ['dl-1'],
      'admin-1',
      'batch retry',
    );
  });
});
