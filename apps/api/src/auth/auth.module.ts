import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleOAuthService } from './google-oauth.service';
import { AuthTokenCleanupService } from './auth-token-cleanup.service';
import { AccountPolicyService } from './account-policy.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt/jwt.guard';
import { RolesGuard } from './guards/roles/roles.guard';
import { CsrfGuard } from './guards/csrf/csrf.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { StringValue } from 'ms';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_ACCESS_SECRET');
        if (!secret || secret === 'secret') {
          throw new Error(
            'JWT_ACCESS_SECRET must be set and must not be the default placeholder',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn:
              configService.get<StringValue>('JWT_ACCESS_EXPIRES_IN') || '15m',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, GoogleOAuthController],
  providers: [
    AuthService,
    GoogleOAuthService,
    AuthTokenCleanupService,
    AccountPolicyService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    CsrfGuard,
  ],
  exports: [
    AuthService,
    AccountPolicyService,
    JwtAuthGuard,
    RolesGuard,
    CsrfGuard,
  ],
})
export class AuthModule {}
