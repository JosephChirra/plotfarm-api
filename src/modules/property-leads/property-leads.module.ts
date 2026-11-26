import { Module } from "@nestjs/common";
import { PropertyLeadsController } from "./property-leads.controller";
import { LeadsController } from "./leads.controller";
import { PropertyLeadsService } from "./property-leads.service";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ChatGateway } from "./websockets/chat.gateway";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PropertyLeadsController, LeadsController],
  providers: [PropertyLeadsService, ChatGateway],
  exports: [PropertyLeadsService],
})
export class PropertyLeadsModule {}
