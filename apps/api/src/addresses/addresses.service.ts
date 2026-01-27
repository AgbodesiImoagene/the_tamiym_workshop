import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new shipping address for a user
   * @param userId User ID
   * @param createAddressDto Address data
   * @returns Created address
   */
  async create(userId: string, createAddressDto: CreateAddressDto) {
    // If setting as default, unset other default addresses
    if (createAddressDto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // If no default address exists, make this one default
    const existingDefault = await this.prisma.address.findFirst({
      where: { userId, isDefault: true },
    });

    const isDefault = createAddressDto.isDefault ?? !existingDefault;

    const address = await this.prisma.address.create({
      data: {
        userId,
        street: createAddressDto.street,
        city: createAddressDto.city,
        state: createAddressDto.state,
        postalCode: createAddressDto.postalCode,
        country: createAddressDto.country || 'Nigeria',
        isDefault,
      },
    });

    return address;
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
  async findOne(userId: string, addressId: string) {
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
    const address = await this.findOne(userId, addressId);

    // If setting as default, unset other default addresses
    if (updateAddressDto.isDefault === true) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    const updatedAddress = await this.prisma.address.update({
      where: { id: addressId },
      data: {
        street: updateAddressDto.street,
        city: updateAddressDto.city,
        state: updateAddressDto.state,
        postalCode: updateAddressDto.postalCode,
        country: updateAddressDto.country,
        isDefault: updateAddressDto.isDefault,
      },
    });

    return updatedAddress;
  }

  /**
   * Delete an address
   * @param userId User ID
   * @param addressId Address ID
   */
  async remove(userId: string, addressId: string) {
    const address = await this.findOne(userId, addressId);

    await this.prisma.address.delete({
      where: { id: addressId },
    });

    // If deleted address was default, set the most recent address as default
    if (address.isDefault) {
      const mostRecent = await this.prisma.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      if (mostRecent) {
        await this.prisma.address.update({
          where: { id: mostRecent.id },
          data: { isDefault: true },
        });
      }
    }
  }
}
