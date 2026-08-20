import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayoutProfileDto } from './dto/create-payout-profile.dto';
import { UpdatePayoutProfileDto } from './dto/update-payout-profile.dto';
import { AccountPolicyService } from '../auth/account-policy.service';

@Injectable()
export class PayoutProfilesService {
  constructor(
    private prisma: PrismaService,
    private accountPolicy: AccountPolicyService,
  ) {}

  async findAllForUser(userId: string) {
    return this.prisma.userPayoutProfile.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const profile = await this.prisma.userPayoutProfile.findUnique({
      where: { id },
    });
    if (!profile) throw new NotFoundException('Payout profile not found');
    if (profile.userId !== userId)
      throw new ForbiddenException('Access denied');
    return profile;
  }

  private async assertVerifiedForMutate(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (!user) {
      throw new ForbiddenException('Access denied');
    }
    this.accountPolicy.assertVerifiedForAction(user, 'MUTATE_PAYOUT_PROFILE');
  }

  async create(userId: string, dto: CreatePayoutProfileDto) {
    await this.assertVerifiedForMutate(userId);
    const isFirst = await this.prisma.userPayoutProfile.count({
      where: { userId },
    });
    return this.prisma.userPayoutProfile.create({
      data: {
        userId,
        label: dto.label ?? null,
        bankCode: dto.bankCode,
        bankName: dto.bankName ?? null,
        accountName: dto.accountName,
        accountNumber: dto.accountNumber,
        isDefault: isFirst === 0,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdatePayoutProfileDto) {
    await this.assertVerifiedForMutate(userId);
    await this.findOne(userId, id);
    if (dto.isDefault === true) {
      await this.prisma.userPayoutProfile.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }
    return this.prisma.userPayoutProfile.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertVerifiedForMutate(userId);
    const profile = await this.findOne(userId, id);

    // Block deletion if any campaign is pointing directly at this profile.
    const campaignCount = await this.prisma.campaign.count({
      where: { payoutProfileId: id },
    });
    if (campaignCount > 0) {
      throw new BadRequestException(
        `Cannot delete this payout profile: ${campaignCount} campaign(s) are using it. ` +
          `Re-assign those campaigns to a different profile first.`,
      );
    }

    // Block deletion of the default profile when other profiles exist; the
    // organizer must promote another profile to default first.
    if (profile.isDefault) {
      const totalProfiles = await this.prisma.userPayoutProfile.count({
        where: { userId },
      });
      if (totalProfiles > 1) {
        throw new BadRequestException(
          'Cannot delete the default payout profile while other profiles exist. ' +
            'Set a different profile as default before deleting this one.',
        );
      }
    }

    return this.prisma.userPayoutProfile.delete({ where: { id } });
  }
}
