import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditSource,
  TokenType,
  UserRole,
} from '../generated/prisma/enums';
import { UserStatus } from '../generated/prisma/client';

const ADMIN_USER_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  createdAt: true,
  emailVerifiedAt: true,
} as const;

export type AdminUserListRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  emailVerifiedAt: Date | null;
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async searchUsers(q?: string, take = 50): Promise<AdminUserListRow[]> {
    const trimmed = q?.trim();
    const limit = Math.min(Math.max(take, 1), 100);

    return this.prisma.user.findMany({
      where: {
        status: { not: UserStatus.DELETED },
        ...(trimmed
          ? {
              OR: [
                { email: { contains: trimmed, mode: 'insensitive' } },
                { firstName: { contains: trimmed, mode: 'insensitive' } },
                { lastName: { contains: trimmed, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: ADMIN_USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async setUserRole(
    actorUserId: string,
    actorRole: UserRole,
    targetUserId: string,
    newRole: UserRole,
  ): Promise<AdminUserListRow> {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, status: { not: UserStatus.DELETED } },
      select: ADMIN_USER_LIST_SELECT,
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (target.role === newRole) {
      return target;
    }

    if (target.role === UserRole.ADMIN && newRole !== UserRole.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: {
          role: UserRole.ADMIN,
          status: { not: UserStatus.DELETED },
        },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot change role: this is the only admin account. Promote another admin first.',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: targetUserId },
        data: { role: newRole },
        select: ADMIN_USER_LIST_SELECT,
      });
      await tx.authToken.deleteMany({
        where: {
          userId: targetUserId,
          tokenType: TokenType.REFRESH,
        },
      });
      return row;
    });

    await this.audit.log({
      eventName: 'admin.user.role_updated',
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: targetUserId,
      actorUserId,
      actorRole,
      targetType: 'User',
      targetId: targetUserId,
      before: { role: target.role },
      after: { role: newRole },
      note: 'Admin changed user role',
      source: AuditSource.ADMIN_API,
    });

    return updated;
  }
}
