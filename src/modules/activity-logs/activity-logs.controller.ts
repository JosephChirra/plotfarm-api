import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ActivityLogsService } from './activity-logs.service';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { ActivityLogsQueryDto } from './dto/activity-logs-query.dto';

@Controller('activity-logs')
export class ActivityLogsController {
  constructor(private service: ActivityLogsService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateActivityLogDto, @Req() req: Request & { user?: any }) {
    const user = req.user;
    // For non-admins, force the userId to be the authenticated user
    if (user.role !== UserRole.ADMIN) {
      dto.userId = user.id;
    } else if (!dto.userId) {
      // For admins, default to their own ID if none provided
      dto.userId = user.id;
    }
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: ActivityLogsQueryDto) {
    const { userId, entityType, action, ...pagination } = query;
    return this.service.findAll(pagination, userId, entityType, action);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
