import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { PropertyFeatureMappingService } from './property-feature-mapping.service';
import { CreatePropertyFeatureMappingDto } from './dto/create-property-feature-mapping.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('property-feature-mapping')
export class PropertyFeatureMappingController {
  constructor(private service: PropertyFeatureMappingService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreatePropertyFeatureMappingDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('propertyId') propertyId?: string,
    @Query('featureId') featureId?: string,
  ) {
    return this.service.findAll(propertyId, featureId ? Number(featureId) : undefined);
  }

  @Get(':propertyId/:featureId')
  findOne(
    @Param('propertyId') propertyId: string,
    @Param('featureId', ParseIntPipe) featureId: number,
  ) {
    return this.service.findOne(propertyId, featureId);
  }

  @Delete(':propertyId/:featureId')
  @UseGuards(JwtAuthGuard)
  remove(
    @Param('propertyId') propertyId: string,
    @Param('featureId', ParseIntPipe) featureId: number,
  ) {
    return this.service.remove(propertyId, featureId);
  }
}
