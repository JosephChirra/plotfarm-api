import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { ActiveUserGuard } from './guards/active-user.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { ReferralsModule } from '../referrals/referrals.module';
import { CreditsModule } from '../credits/credits.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    UsersModule,
    NotificationsModule,
    EmailModule,
    SmsModule,
    ReferralsModule,
    CreditsModule,
    WhatsappModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.secret') || 'change-me-in-production',
        signOptions: { expiresIn: config.get('jwt.expiresIn') || '30m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, ActiveUserGuard, OptionalJwtAuthGuard],
  exports: [ActiveUserGuard, OptionalJwtAuthGuard, JwtModule, PassportModule],
})
export class AuthModule { }
