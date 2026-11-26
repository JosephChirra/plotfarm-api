import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ReportTargetType, UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import { FindReportsQueryDto } from './dto/find-reports-query.dto';
import { ReviewReportDto } from './dto/review-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  findAll(@Query() query: FindReportsQueryDto) {
    return this.reportsService.getAllReports(query);
  }

  @Get('target/:targetType/:targetId')
  findByTarget(
    @Param('targetType') targetType: ReportTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.reportsService.getReportsForTarget(targetType, targetId);
  }

  @Patch('target/:targetType/:targetId')
  reviewTarget(
    @Param('targetType') targetType: ReportTargetType,
    @Param('targetId') targetId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReviewReportDto,
  ) {
    return this.reportsService.reviewTarget(targetType, targetId, adminId, dto);
  }

  @Patch(':id')
  review(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReviewReportDto,
  ) {
    return this.reportsService.reviewReport(id, adminId, dto);
  }
}
