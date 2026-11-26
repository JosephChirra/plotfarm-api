import { Module } from "@nestjs/common";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";
import { PropertiesScheduler } from "./properties.scheduler";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";
import { CreditsModule } from "../credits/credits.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReferralsModule } from "../referrals/referrals.module";

@Module({
  imports: [
    AuthModule,
    UploadsModule,
    CreditsModule,
    ReferralsModule,
    NotificationsModule,
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService, PropertiesScheduler],
  exports: [PropertiesService],
})
export class PropertiesModule {}
