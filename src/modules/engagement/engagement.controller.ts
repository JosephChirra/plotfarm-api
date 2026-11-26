import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('engagement')
export class EngagementController {
  constructor(private service: EngagementService) {}

  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  getFavorites(@CurrentUser('id') userId: string) {
    return this.service.getFavorites(userId);
  }

  @Post('posts/:id/favorite')
  @UseGuards(JwtAuthGuard)
  async toggleFavorite(
    @Param('id') propertyId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.toggleFavorite(userId, propertyId);
  }

  @Post('posts/:id/interest')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  async toggleInterest(
    @Param('id') propertyId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.toggleInterest(userId, propertyId);
  }

  @Get('posts/:id/interests')
  @UseGuards(JwtAuthGuard)
  getPropertyInterests(
    @Param('id') propertyId: string,
    @CurrentUser('id') ownerId: string,
  ) {
    return this.service.getPropertyInterests(propertyId, ownerId);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(
    @Query('ids') ids: string,
    @CurrentUser('id') userId: string,
  ) {
    if (!ids) return { favorited: [] as string[], interested: [] as string[] };
    const propertyIds = ids.split(',').filter(Boolean);
    return this.service.getStatus(userId, propertyIds);
  }
}
