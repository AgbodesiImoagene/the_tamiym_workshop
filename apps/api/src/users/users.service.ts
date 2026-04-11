import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '../generated/prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** Fields safe to return from profile APIs (never includes passwordHash or tokens). */
const PUBLIC_PROFILE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get user profile by ID
   * @param userId User ID
   * @returns User profile without password
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: { not: UserStatus.DELETED } },
      select: PUBLIC_PROFILE_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user profile
   * @param userId User ID
   * @param updateProfileDto Profile update data
   * @returns Updated user profile
   */
  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const exists = await this.prisma.user.findFirst({
      where: { id: userId, status: { not: UserStatus.DELETED } },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateProfileDto,
      select: PUBLIC_PROFILE_SELECT,
    });
  }
}
