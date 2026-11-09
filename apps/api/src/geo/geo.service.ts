import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  GeoLgaResponseDto,
  GeoStateResponseDto,
} from './dto/geo-response.dto';

export const GEO_STATE_NOT_FOUND = 'GEO_STATE_NOT_FOUND';

/** TTW-087: read-only states and LGAs for the address forms. */
@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  listStates(): Promise<GeoStateResponseDto[]> {
    return this.prisma.geoState.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { code: true, name: true },
    });
  }

  async listLgas(code: string): Promise<GeoLgaResponseDto[]> {
    const stateCode = code.trim().toUpperCase();
    const state = await this.prisma.geoState.findFirst({
      where: { code: stateCode, isActive: true },
      select: { code: true },
    });
    if (!state) {
      throw new NotFoundException({
        statusCode: 404,
        code: GEO_STATE_NOT_FOUND,
        message: 'State not found',
      });
    }
    return this.prisma.geoLga.findMany({
      where: { stateCode: state.code, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
