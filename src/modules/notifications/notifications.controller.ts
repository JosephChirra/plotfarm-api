import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, type User } from '@prisma/client';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private service: NotificationsService) { }

  @Get()
  findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: User,
  ) {
    return this.service.findAll(pagination, user.id);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: User) {
    return this.service.getUnreadCount(user.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: User) {
    return this.service.markAllRead(user.id);
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.service.markAsRead(id, user.id);
  }

  @Post('tokens')
  registerToken(
    @Body('token') token: string,
    @Body('platform') platform: string,
    @CurrentUser() user: User,
  ) {
    return this.service.registerDeviceToken(user.id, token, platform);
  }

  @Delete('tokens/:token')
  unregisterToken(@Param('token') token: string) {
    return this.service.unregisterDeviceToken(token);
  }

  @Patch('preferences/:type')
  updatePreferences(
    @Param('type') type: string,
    @Body() preferences: { inApp?: boolean; push?: boolean; email?: boolean },
    @CurrentUser() user: User,
  ) {
    return this.service.updatePreferences(user.id, type, preferences);
  }

  @Post('broadcast')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  broadcast(@Body() payload: any) {
    return this.service.broadcast(payload);
  }
}
