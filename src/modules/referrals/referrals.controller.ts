import {
  DefaultValuePipe,
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Post,
  Delete,
  ParseIntPipe,
} from "@nestjs/common";
import { ReferralsService } from "./referrals.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import {
  AdminUpdateReferralDto,
  AdminRepairAttributionDto,
  AdminSetCampaignDto,
  ListReferralsQueryDto,
  UpdateReferralConfigDto,
} from "./dto/referrals.dto";
import { ConfigService } from "@nestjs/config";
import { UserRole } from "@prisma/client";

@UseGuards(JwtAuthGuard)
@Controller("referrals")
export class ReferralsController {
  constructor(
    private readonly referralsService: ReferralsService,
    private readonly configService: ConfigService,
  ) {}

  // ── User Endpoints ───────────────────────────────────────────────────────────

  /** GET /referrals/my-code — Get or generate the user's referral code + share URL */
  @Get("my-code")
  getMyCode(@Req() req: any) {
    const appBaseUrl =
      this.configService.get<string>("APP_BASE_URL") || "http://localhost:3000";
    return this.referralsService.getMyReferralInfo(req.user.id, appBaseUrl);
  }

  /** GET /referrals/my-referrals — Paginated list of this user's referrals */
  @Get("my-referrals")
  getMyReferrals(
    @Req() req: any,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.referralsService.getMyReferrals(req.user.id, page, limit);
  }

  /** GET /referrals/summary — compact user referral summary */
  @Get("summary")
  getSummary(@Req() req: any) {
    return this.referralsService.getReferralSummary(req.user.id);
  }

  /** GET /referrals/list — compact user referral list */
  @Get("list")
  getList(
    @Req() req: any,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.referralsService.getReferralList(req.user.id, page, limit);
  }

  /** GET /referrals/leaderboard — Top referrers (public) */
  @Get("leaderboard")
  getLeaderboard(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.referralsService.getLeaderboard(limit);
  }

  /** GET /referrals/config — Current active referral config */
  @Get("config")
  getConfig() {
    return this.referralsService.getPublicConfig();
  }

  /** GET /referrals/me/progress — step-by-step progress for invited user (referee) */
  @Get("me/progress")
  getMyProgress(@Req() req: any) {
    return this.referralsService.getMyReferralProgress(req.user.id);
  }

  // ── Admin Endpoints ──────────────────────────────────────────────────────────

  /** GET /referrals/admin/stats — Platform-wide referral stats */
  @Get("admin/stats")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminStats() {
    return this.referralsService.adminGetStats();
  }

  /** GET /referrals/admin — All referral records with filters */
  @Get("admin")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminList(@Query() query: ListReferralsQueryDto) {
    return this.referralsService.adminListReferrals(query);
  }

  /** GET /referrals/admin/diagnostics — Explain missing attribution (admin) */
  @Get("admin/diagnostics")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminDiagnostics(
    @Query("refereeEmail") refereeEmail?: string,
    @Query("referralCode") referralCode?: string,
  ) {
    return this.referralsService.adminDiagnostics({
      refereeEmail,
      referralCode,
    });
  }

  /** GET /referrals/admin/:id/details — Full referral audit view (admin) */
  @Get("admin/:id/details")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminDetails(@Param("id") id: string) {
    return this.referralsService.adminGetReferralDetails(id);
  }

  @Put("admin/config")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateConfig(@Body() dto: UpdateReferralConfigDto) {
    const { postCostCredits, postVisibilityDays, ...rest } = dto;
    return this.referralsService.updateConfig({
      ...rest,
      ...(rest.listingCostCredits == null && postCostCredits != null
        ? { listingCostCredits: postCostCredits }
        : {}),
      ...(rest.listingVisibilityDays == null && postVisibilityDays != null
        ? { listingVisibilityDays: postVisibilityDays }
        : {}),
      ...(rest.listingCostCredits != null && postCostCredits == null
        ? { postCostCredits: rest.listingCostCredits }
        : {}),
      ...(rest.listingVisibilityDays != null && postVisibilityDays == null
        ? { postVisibilityDays: rest.listingVisibilityDays }
        : {}),
    });
  }

  /** PUT /referrals/admin/:id — Manually qualify, flag, or annotate a referral */
  @Put("admin/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminUpdate(@Param("id") id: string, @Body() dto: AdminUpdateReferralDto) {
    return this.referralsService.adminUpdateReferral(id, dto);
  }

  /** POST /referrals/admin/repair-attribution — Re-run attribution for a referee (admin) */
  @Post("admin/repair-attribution")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminRepairAttribution(
    @Body() dto: AdminRepairAttributionDto,
    @Req() req: any,
  ) {
    const ipAddress =
      (req as any).ip || (req as any).headers?.["x-forwarded-for"];
    return this.referralsService.adminRepairAttribution(
      dto.refereeId,
      dto.referralCode,
      ipAddress,
    );
  }

  /** POST /referrals/admin/campaign — Set a time-bound bonus campaign */
  @Post("admin/campaign")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminSetCampaign(@Body() dto: AdminSetCampaignDto) {
    return this.referralsService.adminSetCampaign(dto);
  }

  /** DELETE /referrals/admin/campaign — Clear active campaign */
  @Delete("admin/campaign")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminClearCampaign() {
    return this.referralsService.adminClearCampaign();
  }
}
