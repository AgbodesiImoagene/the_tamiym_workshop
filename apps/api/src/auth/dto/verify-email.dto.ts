import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'clx...', description: 'Email verification token' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
