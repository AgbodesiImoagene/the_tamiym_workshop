import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
