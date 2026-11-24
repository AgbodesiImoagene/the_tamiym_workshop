import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';
import { RegisterDto } from './register.dto';

const SIGNUP_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

class EmailMaxLengthDto {
  // Normalised once, here: the pending row key, the throttle identity, the user lookup and the
  // mail recipient all use this value.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @MaxLength(254)
  email!: string;
}

/**
 * TTW-254: start of a sign-up confirmed by an emailed code. Same fields and
 * rules as `RegisterDto` (so the two stay in sync), plus a length cap on the email.
 */
export class RegisterStartDto extends IntersectionType(
  RegisterDto,
  EmailMaxLengthDto,
) {}

export class VerifySignupCodeDto {
  @ApiProperty({
    description:
      'Token returned by `register/start`; binds this browser to the sign-up',
    example: 'a'.repeat(64),
  })
  @IsString()
  @Matches(SIGNUP_TOKEN_PATTERN)
  signupToken!: string;

  @ApiProperty({
    description: 'Six-digit code from the email',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ResendSignupCodeDto {
  @ApiProperty({ example: 'a'.repeat(64) })
  @IsString()
  @Matches(SIGNUP_TOKEN_PATTERN)
  signupToken!: string;
}
