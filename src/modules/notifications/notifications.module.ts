import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailModule } from '../email/email.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsGateway } from './websockets/notifications.gateway';
import { NotificationsListener } from './events/notifications.listener';
import { PushNotificationProcessor } from './queues/push-notification.processor';
import { EmailNotificationProcessor } from './queues/email-notification.processor';

const REDIS_ENABLED = process.env['REDIS_ENABLED'] === 'true';

@Module({
  imports: [
    EmailModule,
    ConfigModule,
    ...(REDIS_ENABLED
      ? [
          BullModule.registerQueueAsync(
            {
              name: 'push_notifications',
              imports: [ConfigModule],
              inject: [ConfigService],
              useFactory: (config: ConfigService) => ({
                connection: {
                  host: config.get('REDIS_HOST', 'localhost'),
                  port: config.get('REDIS_PORT', 6379),
                },
              }),
            },
            {
              name: 'email_notifications',
              imports: [ConfigModule],
              inject: [ConfigService],
              useFactory: (config: ConfigService) => ({
                connection: {
                  host: config.get('REDIS_HOST', 'localhost'),
                  port: config.get('REDIS_PORT', 6379),
                },
              }),
            },
          ),
        ]
      : []),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsListener,
    {
      provide: 'REDIS_ENABLED',
      useValue: REDIS_ENABLED,
    },
    ...(REDIS_ENABLED ? [PushNotificationProcessor, EmailNotificationProcessor] : []),
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
