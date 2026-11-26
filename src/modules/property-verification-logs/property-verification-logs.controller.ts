import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PropertyVerificationLogsService } from './property-verification-logs.service';
import { CreatePropertyVerificationLogDto } from './dto/create-property-verification-log.dto';

@Controller('property-verification-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PropertyVerificationLogsController {
  constructor(private service: PropertyVerificationLogsService) { }

  @Post()
  create(@Body() dto: CreatePropertyVerificationLogDto) {
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
