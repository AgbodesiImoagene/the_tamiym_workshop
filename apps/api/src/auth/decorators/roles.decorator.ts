import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@tamiym/types';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
