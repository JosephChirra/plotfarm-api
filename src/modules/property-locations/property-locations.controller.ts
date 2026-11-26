import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PropertyLocationsService } from './property-locations.service';
import { CreatePropertyLocationDto } from './dto/create-property-location.dto';
import { UpdatePropertyLocationDto } from './dto/update-property-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('property-locations')
export class PropertyLocationsController {
  constructor(private service: PropertyLocationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreatePropertyLocationDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('states/distinct')
  findDistinctStates() {
    return this.service.findDistinctStates();
  }

  @Get('districts/distinct')
  findDistinctDistricts(@Query('state') state?: string) {
    return this.service.findDistinctDistricts(state);
  }

  @Get('mandals/distinct')
  findDistinctMandals(@Query('district') district?: string) {
    return this.service.findDistinctMandals(district);
  }

  @Get('villages/distinct')
  findDistinctVillages(@Query('mandal') mandal?: string) {
    return this.service.findDistinctVillages(mandal);
  }

  @Get('property/:propertyId')
  findByPropertyId(@Param('propertyId') propertyId: string) {
    return this.service.findByPropertyId(propertyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdatePropertyLocationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
