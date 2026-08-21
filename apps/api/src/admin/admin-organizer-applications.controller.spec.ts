import { AdminOrganizerApplicationsController } from './admin-organizer-applications.controller';
import { OrganizerApplicationsService } from '../organizer/organizer-applications.service';

describe('AdminOrganizerApplicationsController', () => {
  const service = {
    listForAdmin: jest.fn(),
    getForAdmin: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
  };
  const controller = new AdminOrganizerApplicationsController(
    service as unknown as OrganizerApplicationsService,
  );
  const admin = { id: 'admin-1' } as never;

  it('delegates queue/detail/approve/reject', async () => {
    service.listForAdmin.mockResolvedValue([]);
    await expect(controller.list(undefined)).resolves.toEqual([]);
    service.getForAdmin.mockResolvedValue({ id: 'a1' });
    await expect(controller.get('a1')).resolves.toEqual({ id: 'a1' });
    service.approve.mockResolvedValue({ id: 'a1', status: 'APPROVED' });
    await expect(
      controller.approve(admin, 'a1', { internalNotes: 'ok' }),
    ).resolves.toEqual({ id: 'a1', status: 'APPROVED' });
    service.reject.mockResolvedValue({ id: 'a1', status: 'REJECTED' });
    await expect(
      controller.reject(admin, 'a1', {
        customerVisibleReason: 'Please clarify your intended use.',
      }),
    ).resolves.toEqual({ id: 'a1', status: 'REJECTED' });
  });
});
