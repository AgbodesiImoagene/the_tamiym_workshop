import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateShippingZoneAreaDto {
  @ApiProperty({ example: 'LA', description: 'State code (e.g. LA for Lagos)' })
  @IsString()
  @IsNotEmpty()
  stateCode!: string;

  @ApiPropertyOptional({
    description: 'LGA ID for LGA-specific area; omit for state-wide',
  })
  @IsOptional()
  @IsString()
  lgaId?: string | null;
}
