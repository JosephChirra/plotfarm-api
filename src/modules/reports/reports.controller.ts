import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CheckReportQueryDto } from './dto/check-report-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReportDto) {
    return this.reportsService.createReport(userId, dto);
  }

  @Get('check')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  check(@CurrentUser('id') userId: string, @Query() query: CheckReportQueryDto) {
    return this.reportsService.hasReported(userId, query.targetId).then((reported) => ({ reported }));
  }
}
