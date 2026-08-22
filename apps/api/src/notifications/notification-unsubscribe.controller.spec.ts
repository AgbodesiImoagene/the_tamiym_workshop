import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { NotificationUnsubscribeController } from './notification-unsubscribe.controller';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationUnsubscribeDto } from './dto/notification-unsubscribe.dto';

describe('NotificationUnsubscribeController', () => {
  let controller: NotificationUnsubscribeController;
  const preferences = {
    applyUnsubscribeToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationUnsubscribeController],
      providers: [
        { provide: NotificationPreferenceService, useValue: preferences },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(NotificationUnsubscribeController);
  });

  it('applies unsubscribe token', async () => {
    preferences.applyUnsubscribeToken.mockResolvedValue({ applied: true });
    const dto = new NotificationUnsubscribeDto();
    dto.token = 'signed-token-value-1234';

    const result = await controller.unsubscribe(dto);

    expect(preferences.applyUnsubscribeToken).toHaveBeenCalledWith(
      'signed-token-value-1234',
    );
    expect(result).toEqual({ applied: true });
  });
});
