import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { HealthController } from "./health.controller";
import { SchemaReadinessService } from "./schema-readiness.service";

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [SchemaReadinessService],
  exports: [SchemaReadinessService],
})
export class HealthModule {}

