import { Module } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { DatabaseModule } from '../../core/database/database.module';
import { CreditsModule } from '../credits/credits.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReferralsScheduler } from './referrals.scheduler';

@Module({
  imports: [DatabaseModule, CreditsModule, NotificationsModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, ReferralsScheduler],
  exports: [ReferralsService],
})
export class ReferralsModule {}
