import { Module } from '@nestjs/common';
import { PropertyLocationsController } from './property-locations.controller';
import { PropertyLocationsService } from './property-locations.service';

@Module({
  controllers: [PropertyLocationsController],
  providers: [PropertyLocationsService],
})
export class PropertyLocationsModule {}
