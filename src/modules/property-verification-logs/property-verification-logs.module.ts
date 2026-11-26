import { Module } from '@nestjs/common';
import { PropertyVerificationLogsController } from './property-verification-logs.controller';
import { PropertyVerificationLogsService } from './property-verification-logs.service';

@Module({
  controllers: [PropertyVerificationLogsController],
  providers: [PropertyVerificationLogsService],
})
export class PropertyVerificationLogsModule {}
