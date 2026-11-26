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
import { PropertyMediaService } from './property-media.service';
import { CreatePropertyMediaDto } from './dto/create-property-media.dto';
import { UpdatePropertyMediaDto } from './dto/update-property-media.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('property-media')
export class PropertyMediaController {
  constructor(private service: PropertyMediaService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreatePropertyMediaDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('propertyId') propertyId?: string) {
    return this.service.findAll(propertyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdatePropertyMediaDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
