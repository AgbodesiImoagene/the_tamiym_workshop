import { Test } from '@nestjs/testing';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { UserRole } from '../generated/prisma/enums';

describe('AdminUsersController', () => {
  it('resetMfa delegates to the service', async () => {
    const adminUsers = {
      resetUserMfa: jest.fn().mockResolvedValue({ reset: true }),
    };
    const module = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [{ provide: AdminUsersService, useValue: adminUsers }],
    }).compile();
    const controller = module.get(AdminUsersController);
    const result = await controller.resetMfa('target', {
      id: 'actor',
      role: UserRole.ADMIN,
    } as never);
    expect(result).toEqual({ reset: true });
    expect(adminUsers.resetUserMfa).toHaveBeenCalledWith(
      'actor',
      UserRole.ADMIN,
      'target',
    );
  });
});
