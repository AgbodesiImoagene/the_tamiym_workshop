import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayoutProfileDto } from './dto/create-payout-profile.dto';
import { UpdatePayoutProfileDto } from './dto/update-payout-profile.dto';
import { AccountPolicyService } from '../auth/account-policy.service';
import { PayoutProfileStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import {
  maskAccountNumber,
  resolvePayoutBankResolutionMode,
} from '../payouts/payout-eligibility';

@Injectable()
export class PayoutProfilesService {
  constructor(
    private prisma: PrismaService,
    private accountPolicy: AccountPolicyService,
    private config: ConfigService,
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

  private bankResolutionMode(): 'stub' | 'live' {
    return resolvePayoutBankResolutionMode(
      this.config.get<string>('PAYOUT_BANK_RESOLUTION_MODE'),
      this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV,
    );
  }

  /**
   * Slice 1 bank resolution: stub writes STUB_MATCH and verifies;
   * live leaves PENDING_VERIFICATION for admin verify until provider lands.
   */
  private resolveBankOnCreate(dto: CreatePayoutProfileDto): {
    status: PayoutProfileStatus;
    bankResolutionStatus: string | null;
    verifiedAt: Date | null;
  } {
    const mode = this.bankResolutionMode();
    if (mode === 'stub') {
      // Deterministic interim: treat supplied NUBAN fields as matched.
      void dto.bankCode;
      void dto.accountNumber;
      void dto.accountName;
      return {
        status: PayoutProfileStatus.VERIFIED,
        bankResolutionStatus: 'STUB_MATCH',
        verifiedAt: new Date(),
      };
    }
    return {
      status: PayoutProfileStatus.PENDING_VERIFICATION,
      bankResolutionStatus: null,
      verifiedAt: null,
    };
  }

  async create(userId: string, dto: CreatePayoutProfileDto) {
    await this.assertVerifiedForMutate(userId);
    const resolution = this.resolveBankOnCreate(dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingCount = await tx.userPayoutProfile.count({
          where: { userId },
        });
        const makeDefault = existingCount === 0;

        if (makeDefault) {
          // Clear any stray defaults before insert (partial unique index).
          await tx.userPayoutProfile.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.userPayoutProfile.create({
          data: {
            userId,
            label: dto.label ?? null,
            bankCode: dto.bankCode,
            bankName: dto.bankName ?? null,
            accountName: dto.accountName,
            accountNumber: dto.accountNumber,
            isDefault: makeDefault,
            status: resolution.status,
            bankResolutionStatus: resolution.bankResolutionStatus,
            verifiedAt: resolution.verifiedAt,
            destinationVersion: 1,
          },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A default payout profile already exists for this user',
        );
      }
      throw err;
    }
  }

  async update(userId: string, id: string, dto: UpdatePayoutProfileDto) {
    await this.assertVerifiedForMutate(userId);
    const existing = await this.findOne(userId, id);

    const bankChanging =
      (dto.bankCode !== undefined && dto.bankCode !== existing.bankCode) ||
      (dto.accountNumber !== undefined &&
        dto.accountNumber !== existing.accountNumber) ||
      (dto.accountName !== undefined &&
        dto.accountName !== existing.accountName) ||
      (dto.bankName !== undefined && dto.bankName !== existing.bankName);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.userPayoutProfile.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }

      let status = existing.status;
      let bankResolutionStatus = existing.bankResolutionStatus;
      let verifiedAt = existing.verifiedAt;
      let destinationVersion = existing.destinationVersion;
      let recipientCode: string | null | undefined = undefined;

      if (bankChanging) {
        destinationVersion = existing.destinationVersion + 1;
        recipientCode = null;
        const mode = this.bankResolutionMode();
        if (mode === 'stub') {
          status = PayoutProfileStatus.VERIFIED;
          bankResolutionStatus = 'STUB_MATCH';
          verifiedAt = new Date();
        } else {
          status = PayoutProfileStatus.PENDING_VERIFICATION;
          bankResolutionStatus = null;
          verifiedAt = null;
        }
      }

      return tx.userPayoutProfile.update({
        where: { id },
        data: {
          ...(dto.label !== undefined && { label: dto.label }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
          ...(dto.bankCode !== undefined && { bankCode: dto.bankCode }),
          ...(dto.bankName !== undefined && { bankName: dto.bankName }),
          ...(dto.accountName !== undefined && {
            accountName: dto.accountName,
          }),
          ...(dto.accountNumber !== undefined && {
            accountNumber: dto.accountNumber,
          }),
          ...(bankChanging && {
            status,
            bankResolutionStatus,
            verifiedAt,
            destinationVersion,
            recipientCode,
          }),
        },
      });
    });
  }

  /**
   * Safe API projection: never return full account numbers.
   */
  toPublicProfile<T extends { accountNumber: string }>(
    profile: T,
  ): Omit<T, 'accountNumber'> & { accountNumberMasked: string | null } {
    const { accountNumber, ...rest } = profile;
    return {
      ...rest,
      accountNumberMasked: maskAccountNumber(accountNumber),
    };
  }

  /**
   * Admin / ops: mark a pending destination verified (interim until live provider).
   */
  async adminSetStatus(id: string, status: PayoutProfileStatus) {
    const profile = await this.prisma.userPayoutProfile.findUnique({
      where: { id },
    });
    if (!profile) throw new NotFoundException('Payout profile not found');

    const now = new Date();
    const updated = await this.prisma.userPayoutProfile.update({
      where: { id },
      data: {
        status,
        verifiedAt:
          status === PayoutProfileStatus.VERIFIED ? now : profile.verifiedAt,
        rejectedAt:
          status === PayoutProfileStatus.REJECTED ? now : profile.rejectedAt,
        suspendedAt:
          status === PayoutProfileStatus.SUSPENDED ? now : profile.suspendedAt,
        bankResolutionStatus:
          status === PayoutProfileStatus.VERIFIED
            ? (profile.bankResolutionStatus ?? 'LIVE_MATCH')
            : profile.bankResolutionStatus,
      },
    });
    return this.toPublicProfile(updated);
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
