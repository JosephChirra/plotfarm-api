import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './core/config/configuration';
import { HttpLoggingMiddleware } from './core/middleware/http-logging.middleware';
import { DatabaseModule } from './core/database/database.module';
import { UsersModule } from './modules/users/users.module';
import { UserProfilesModule } from './modules/user-profiles/user-profiles.module';
import { UserDevicesModule } from './modules/user-devices/user-devices.module';
import { PropertyCategoriesModule } from './modules/property-categories/property-categories.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { PropertyLocationsModule } from './modules/property-locations/property-locations.module';
import { PropertyMediaModule } from './modules/property-media/property-media.module';
import { PropertyFeaturesModule } from './modules/property-features/property-features.module';
import { PropertyFeatureMappingModule } from './modules/property-feature-mapping/property-feature-mapping.module';
import { PropertyVerificationLogsModule } from './modules/property-verification-logs/property-verification-logs.module';
import { PropertyLeadsModule } from './modules/property-leads/property-leads.module';
import { PropertyFavoritesModule } from './modules/property-favorites/property-favorites.module';
import { PlansModule } from './modules/plans/plans.module';
import { UserSubscriptionsModule } from './modules/user-subscriptions/user-subscriptions.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { AuthModule } from './modules/auth/auth.module';
import { StatsModule } from './modules/stats/stats.module';
import { SearchModule } from './modules/search/search.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ReportsModule } from './modules/reports/reports.module';
import { EmailModule } from './modules/email/email.module';
import { SmsModule } from './modules/sms/sms.module';
import { AppController } from './app.controller';
import { AnonymizeUserInterceptor } from './shared/interceptors/anonymize-user.interceptor';
import { ModerationLogsModule } from './modules/moderation-logs/moderation-logs.module';
import { CreditsModule } from './modules/credits/credits.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { HealthModule } from './core/health/health.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

const REDIS_ENABLED = process.env['REDIS_ENABLED'] === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRoot([
      // Used explicitly on auth endpoints only via @UseGuards(ThrottlerGuard)
      // Read endpoints and general API are NOT throttled globally
      { name: 'auth', ttl: 60000, limit: 10 },
      { name: 'otp', ttl: 60000, limit: 5 },
    ]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ...(REDIS_ENABLED
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              connection: {
                host: configService.get('REDIS_HOST', 'localhost'),
                port: configService.get('REDIS_PORT', 6379),
              },
            }),
          }),
        ]
      : []),
    DatabaseModule,
    HealthModule,
    AuthModule,
    StatsModule,
    SearchModule,
    UploadsModule,
    EmailModule,
    SmsModule,
    UsersModule,
    UserProfilesModule,
    UserDevicesModule,
    PropertyCategoriesModule,
    PropertiesModule,
    ProjectsModule,
    PropertyLocationsModule,
    PropertyMediaModule,
    PropertyFeaturesModule,
    PropertyFeatureMappingModule,
    PropertyVerificationLogsModule,
    PropertyLeadsModule,
    PropertyFavoritesModule,
    PlansModule,
    UserSubscriptionsModule,
    ActivityLogsModule,
    NotificationsModule,
    EngagementModule,
    ReportsModule,
    ModerationLogsModule,
    CreditsModule,
    ReferralsModule,
    WhatsappModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AnonymizeUserInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggingMiddleware).forRoutes('*');
  }
}
