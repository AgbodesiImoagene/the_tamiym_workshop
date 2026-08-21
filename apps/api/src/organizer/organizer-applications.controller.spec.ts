import { OrganizerApplicationsController } from './organizer-applications.controller';
import { OrganizerApplicationsService } from './organizer-applications.service';

describe('OrganizerApplicationsController', () => {
  const service = {
    getEligibility: jest.fn(),
    getStatus: jest.fn(),
    submit: jest.fn(),
    withdraw: jest.fn(),
  };
  const controller = new OrganizerApplicationsController(
    service as unknown as OrganizerApplicationsService,
  );
  const user = { id: 'u1' } as never;

  it('delegates eligibility/status/submit/withdraw', async () => {
    service.getEligibility.mockResolvedValue({ eligible: true });
    await expect(controller.getEligibility(user)).resolves.toEqual({
      eligible: true,
    });
    service.getStatus.mockResolvedValue({ isOrganizer: false });
    await expect(controller.getStatus(user)).resolves.toEqual({
      isOrganizer: false,
    });
    service.submit.mockResolvedValue({ id: 'a1' });
    await expect(
      controller.submit(user, { organisationName: 'Org' } as never),
    ).resolves.toEqual({ id: 'a1' });
    service.withdraw.mockResolvedValue({ id: 'a1', status: 'WITHDRAWN' });
    await expect(controller.withdraw(user, 'a1')).resolves.toEqual({
      id: 'a1',
      status: 'WITHDRAWN',
    });
  });
});
