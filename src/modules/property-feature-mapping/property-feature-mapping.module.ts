import { Module } from '@nestjs/common';
import { PropertyFeatureMappingController } from './property-feature-mapping.controller';
import { PropertyFeatureMappingService } from './property-feature-mapping.service';

@Module({
  controllers: [PropertyFeatureMappingController],
  providers: [PropertyFeatureMappingService],
})
export class PropertyFeatureMappingModule {}
