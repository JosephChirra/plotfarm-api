import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ModerationLogsService } from './moderation-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, ReportTargetType } from '@prisma/client';

@Controller('admin/moderation-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ModerationLogsController {
  constructor(private readonly moderationLogsService: ModerationLogsService) {}

  @Get()
  async getLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('targetType') targetType?: ReportTargetType,
    @Query('adminId') adminId?: string,
  ) {
    return this.moderationLogsService.findAll({ page, limit, targetType, adminId });
  }
}
