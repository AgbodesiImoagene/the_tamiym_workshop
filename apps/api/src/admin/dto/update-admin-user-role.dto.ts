import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../../generated/prisma/enums';

export class UpdateAdminUserRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({
    description:
      'Required when promoting CUSTOMER → ORGANIZER (creates equivalent APPROVED application).',
    minLength: 10,
    maxLength: 500,
  })
  @ValidateIf((o: UpdateAdminUserRoleDto) => o.role === UserRole.ORGANIZER)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}
