import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferenceService } from './notification-preference.service';

describe('NotificationPreferencesController', () => {
  let controller: NotificationPreferencesController;
  const preferences = {
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
    grantMarketingConsent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferencesController],
      providers: [
        { provide: NotificationPreferenceService, useValue: preferences },
      ],
    }).compile();
    controller = module.get(NotificationPreferencesController);
  });

  it('delegates getPreferences', async () => {
    preferences.getPreferences.mockResolvedValue({ preferences: [] });
    await controller.getPreferences({ id: 'u1' } as never);
    expect(preferences.getPreferences).toHaveBeenCalledWith('u1');
  });

  it('delegates updatePreferences', async () => {
    preferences.updatePreferences.mockResolvedValue({ preferences: [] });
    await controller.updatePreferences(
      { id: 'u1' } as never,
      {
        preferences: [
          {
            channel: 'EMAIL',
            category: 'MARKETING',
            enabled: false,
          },
        ],
      } as never,
    );
    expect(preferences.updatePreferences).toHaveBeenCalled();
  });
});
