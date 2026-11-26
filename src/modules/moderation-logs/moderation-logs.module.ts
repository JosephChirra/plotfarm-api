import { Module } from '@nestjs/common';
import { ModerationLogsService } from './moderation-logs.service';
import { ModerationLogsController } from './moderation-logs.controller';

@Module({
  providers: [ModerationLogsService],
  controllers: [ModerationLogsController],
  exports: [ModerationLogsService]
})
export class ModerationLogsModule {}
