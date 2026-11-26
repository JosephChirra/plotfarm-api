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
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { RequestEmailChangeDto, ConfirmEmailChangeDto } from './dto/email-change.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { id: string }) {
    return this.usersService.findOne(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateMyProfileDto) {
    return this.usersService.updateMyProfile(userId, dto);
  }

  @Post('me/email/request')
  @Throttle({ otp: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  requestEmailChange(@CurrentUser('id') userId: string, @Body() dto: RequestEmailChangeDto) {
    return this.usersService.requestEmailChange(userId, dto.newEmail);
  }

  @Post('me/email/confirm')
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  confirmEmailChange(@CurrentUser('id') userId: string, @Body() dto: ConfirmEmailChangeDto) {
    return this.usersService.confirmEmailChange(userId, dto.newEmail, dto.otp);
  }

  @Post('me/password')
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  // --- User Blocking ---

  @Post('me/blocks/:blockedId')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  blockUser(@CurrentUser('id') userId: string, @Param('blockedId') blockedId: string) {
    return this.usersService.blockUser(userId, blockedId);
  }

  @Delete('me/blocks/:blockedId')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  unblockUser(@CurrentUser('id') userId: string, @Param('blockedId') blockedId: string) {
    return this.usersService.unblockUser(userId, blockedId);
  }

  @Get('me/blocks')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  getBlockedUsers(@CurrentUser('id') userId: string) {
    return this.usersService.getBlockedUsers(userId);
  }

  // --- Admin Routes ---

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findAll(
      { page: query.page, limit: query.limit },
      { role: query.role },
    );
  }

  @Get('batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findBatch(@Query('ids') ids: string) {
    const idList = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.usersService.findByIds(idList);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
