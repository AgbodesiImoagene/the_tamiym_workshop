import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AdminMfaTokenDto {
  @ApiProperty({
    description:
      'Short-lived MFA challenge JWT from POST /auth/admin/login (not a session)',
  })
  @IsString()
  @IsNotEmpty()
  mfa_token!: string;
}

export class AdminMfaTotpDto extends AdminMfaTokenDto {
  @ApiProperty({
    description: '6-digit TOTP code from the authenticator app',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  totp!: string;
}

export class AdminMfaRecoverDto extends AdminMfaTokenDto {
  @ApiProperty({
    description: 'Single-use recovery code (XXXX-XXXX)',
    example: 'A1B2-C3D4',
  })
  @IsString()
  @IsNotEmpty()
  recovery_code!: string;
}
