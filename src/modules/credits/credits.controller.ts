import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { CreditsService } from './credits.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminAdjustCreditsDto, ConsumeCreditsDto } from './dto/credits.dto';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('credits')
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  /** GET /credits/balance — Current credit balance */
  @Get('balance')
  getBalance(@Req() req: any) {
    return this.creditsService.getBalance(req.user.id);
  }

  /** GET /credits/summary — Balance + this month's stats */
  @Get('summary')
  getSummary(@Req() req: any) {
    return this.creditsService.getWalletSummary(req.user.id);
  }

  /** GET /credits/transactions — Paginated transaction history */
  @Get('transactions')
  getHistory(@Req() req: any, @Query() pagination: PaginationDto) {
    return this.creditsService.getTransactionHistory(req.user.id, pagination);
  }

  /** POST /credits/consume — Debit credits idempotently (used by posting flow) */
  @Post('consume')
  @HttpCode(HttpStatus.OK)
  consume(@Req() req: any, @Body() dto: ConsumeCreditsDto) {
    return this.creditsService.consumeCredits(req.user.id, dto);
  }

  // ── Admin Endpoints ─────────────────────────────────────────────────────────

  /** POST /credits/admin/credit — Manually credit credits to a user */
  @Post('admin/credit')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  adminCredit(@Req() req: any, @Body() dto: AdminAdjustCreditsDto) {
    return this.creditsService.adminCredit(req.user.id, dto.userId, dto.amount, dto.reason);
  }

  /** POST /credits/admin/debit — Manually debit credits from a user */
  @Post('admin/debit')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  adminDebit(@Req() req: any, @Body() dto: AdminAdjustCreditsDto) {
    return this.creditsService.adminDebit(req.user.id, dto.userId, dto.amount, dto.reason);
  }

  /** GET /credits/admin/user/:userId — View any user's credited balance (Admin) */
  @Get('admin/user/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminGetUserWallet(@Param('userId') userId: string) {
    return this.creditsService.getWalletSummary(userId);
  }

  /** GET /credits/admin/user/:userId/transactions */
  @Get('admin/user/:userId/transactions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminGetUserTransactions(@Param('userId') userId: string, @Query() pagination: PaginationDto) {
    return this.creditsService.getTransactionHistory(userId, pagination);
  }
}
