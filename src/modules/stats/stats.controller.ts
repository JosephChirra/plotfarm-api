import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private statsService: StatsService) { }

  /** Per-user dashboard stats — one call replaces 3–4 separate fetches. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.statsService.getUserDashboardStats(userId, role);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getDashboardStats() {
    return this.statsService.getDashboardStats();
  }

  @Get('top-viewed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getTopViewed(@Query('limit') limit?: string) {
    return this.statsService.getTopViewed(limit ? parseInt(limit, 10) : 10);
  }

  @Get('top-favorited')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getTopFavorited(@Query('limit') limit?: string) {
    return this.statsService.getTopFavorited(limit ? parseInt(limit, 10) : 10);
  }
}
