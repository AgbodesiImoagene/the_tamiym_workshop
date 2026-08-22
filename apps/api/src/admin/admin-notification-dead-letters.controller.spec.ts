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
});
