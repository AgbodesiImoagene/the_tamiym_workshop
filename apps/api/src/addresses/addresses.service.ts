import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressNormalizationService } from '../shipping/address-normalization.service';
import { Prisma } from '../generated/prisma/client';
import { addressInUse } from './addresses.errors';

@Injectable()
export class AddressesService {
  constructor(
    private prisma: PrismaService,
    private readonly addressNormalization: AddressNormalizationService,
  ) {}

  /**
   * Create a new shipping address for a user
   * @param userId User ID
   * @param createAddressDto Address data
   * @returns Created address
   */
  async create(userId: string, createAddressDto: CreateAddressDto) {
    // TTW-219: normalise and validate first. It only reads reference data and
    // may refuse the request, so a refusal changes nothing.
    const normalizedAddress =
      await this.addressNormalization.normalizeForCreate(createAddressDto);

    return this.prisma.$transaction(async (tx) => {
      await this.lockUserAddresses(tx, userId);

      // If setting as default, unset other default addresses
      if (createAddressDto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      // If no default address exists, make this one default
      const existingDefault = await tx.address.findFirst({
        where: { userId, isDefault: true },
      });

      const isDefault = createAddressDto.isDefault ?? !existingDefault;
      const data: Prisma.AddressUncheckedCreateInput = {
        ...normalizedAddress,
        addressLine1:
          normalizedAddress.addressLine1 ?? createAddressDto.addressLine1,
        city: normalizedAddress.city ?? createAddressDto.city,
        state: normalizedAddress.state ?? createAddressDto.state,
        country: normalizedAddress.country ?? 'Nigeria',
        countryCode: normalizedAddress.countryCode ?? 'NG',
        isDefault,
        userId,
      };

      return tx.address.create({ data });
    });
  }

  /**
   * Get all addresses for a user
   * @param userId User ID
   * @returns List of addresses
   */
  async findAll(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Get a single address by ID
   * @param userId User ID
   * @param addressId Address ID
   * @returns Address
   */
  async findUnique(userId: string, addressId: string) {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return address;
  }

  /**
   * Update an address
   * @param userId User ID
   * @param addressId Address ID
   * @param updateAddressDto Update data
   * @returns Updated address
   */
  async update(
    userId: string,
    addressId: string,
    updateAddressDto: UpdateAddressDto,
  ) {
    const address = await this.findUnique(userId, addressId);

    // TTW-219: normalise and validate first (see `create`).
    const normalizedAddress =
      await this.addressNormalization.normalizeForUpdate(
        address,
        updateAddressDto,
      );
    const data: Prisma.AddressUncheckedUpdateInput = {
      ...normalizedAddress,
      ...(updateAddressDto.isDefault !== undefined
        ? { isDefault: updateAddressDto.isDefault }
        : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      await this.lockUserAddresses(tx, userId);

      // TTW-222: the address may have been deleted since it was read above.
      await this.requireOwnedAddress(tx, userId, addressId);

      // If setting as default, unset other default addresses
      if (updateAddressDto.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: addressId } },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data,
      });
    });
  }

  /**
   * Delete an address
   * @param userId User ID
   * @param addressId Address ID
   */
  async remove(userId: string, addressId: string) {
    // Same ownership answers as before (404 / 403) without taking the lock.
    await this.findUnique(userId, addressId);

    // TTW-222: delete and promotion are one transaction under the per-user lock.
    // TTW-227: an order that uses the address makes the database refuse the
    // delete (foreign key, Prisma P2003). The whole transaction rolls back, so
    // nothing changes, and the customer gets a 409 instead of a 500.
    await this.prisma
      .$transaction(async (tx) => {
        await this.lockUserAddresses(tx, userId);

        // Re-read under the lock: a parallel delete may have won, and the
        // default flag may have moved since the first read.
        const address = await this.requireOwnedAddress(tx, userId, addressId);

        await tx.address.delete({ where: { id: addressId } });

        // If deleted address was default, set the most recent address as default
        if (address.isDefault) {
          const mostRecent = await tx.address.findFirst({
            where: { userId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          });

          if (mostRecent) {
            await tx.address.update({
              where: { id: mostRecent.id },
              data: { isDefault: true },
            });
          }
        }
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          throw addressInUse();
        }
        throw error;
      });
  }

  /**
   * TTW-222: read one of the user's addresses inside the locked transaction.
   * A missing row is a 404 (the address was deleted in parallel), not a
   * Prisma P2025 turned into a 500.
   */
  private async requireOwnedAddress(
    tx: Prisma.TransactionClient,
    userId: string,
    addressId: string,
  ) {
    const address = await tx.address.findFirst({
      where: { id: addressId, userId },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  /**
   * TTW-219: serialise the default-address writes of one user. Two quick saves
   * with `isDefault: true` would otherwise both clear and both set, leaving two
   * defaults. The lock is held until the surrounding transaction ends.
   */
  private async lockUserAddresses(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    await tx.$executeRaw`
      SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE
    `;
  }
}
