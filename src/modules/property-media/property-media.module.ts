import { Module } from '@nestjs/common';
import { PropertyMediaController } from './property-media.controller';
import { PropertyMediaService } from './property-media.service';

@Module({
  controllers: [PropertyMediaController],
  providers: [PropertyMediaService],
})
export class PropertyMediaModule {}
