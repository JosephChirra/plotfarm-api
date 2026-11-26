import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../core/database/prisma.service";
import { CreditsService } from "../credits/credits.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  CreditTransactionType,
  Prisma,
  PropertyStatus,
  ReferralStatus,
  VerificationStatus,
} from "@prisma/client";
import {
  AdminSetCampaignDto,
  AdminUpdateReferralDto,
  ListReferralsQueryDto,
} from "./dto/referrals.dto";
import {
  migrationListingsAggregateKey,
  migrationSignupKey,
  referralRewardRefereeKey,
  referralRewardReferrerKey,
} from "../../shared/utils/credit-idempotency";

const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 8;
const MAX_CODE_RETRIES = 5;

function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase();
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code +=
      REFERRAL_CODE_ALPHABET[
        Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)
      ];
  }
  return code;
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);
  private static readonly DEFAULT_POLICY = {
    listingCostCredits: 1,
    listingVisibilityDays: 30,
    newUserGrantListings: 5,
    newUserGrantDays: 30,
    referrerReward: 2,
    refereeBonus: 1,
    referralExpiryDays: 30,
    enableCreditExpiry: true,
  } as const;

  private postPolicyColumnsSupport: boolean | null = null;

  constructor(
    private prisma: PrismaService,
    private creditsService: CreditsService,
    private notificationsService: NotificationsService,
  ) {}

  // ── Config (Credits & Referrals) ───────────────────────────────────────────

  private async hasPostPolicyColumns(): Promise<boolean> {
    if (this.postPolicyColumnsSupport != null) return this.postPolicyColumnsSupport;
    try {
      await this.prisma.$queryRaw`
        SELECT "postCostCredits", "postVisibilityDays"
        FROM "CreditConfig"
        LIMIT 0
      `;
      this.postPolicyColumnsSupport = true;
    } catch {
      this.postPolicyColumnsSupport = false;
      this.logger.warn(
        "CreditConfig post* columns not available yet; using legacy listing* fields only.",
      );
    }
    return this.postPolicyColumnsSupport;
  }

  // Note: during the compatibility window, some environments may still have an older
  // generated Prisma type surface. Use structural typing here to avoid blocking builds.
  private withPostAliases<
    T extends { listingCostCredits: number; listingVisibilityDays: number },
  >(config: T): T & { postCostCredits: number; postVisibilityDays: number } {
    const anyConfig = config as any;
    return {
      ...config,
      postCostCredits: anyConfig.postCostCredits ?? config.listingCostCredits,
      postVisibilityDays:
        anyConfig.postVisibilityDays ?? config.listingVisibilityDays,
    };
  }

  async getConfig() {
    const hasPostCols = await this.hasPostPolicyColumns();

    let config = await (async () => {
      if (hasPostCols) return this.prisma.creditConfig.findFirst();
      // Avoid selecting post* columns against older DBs.
      return this.prisma.creditConfig.findFirst({
        select: {
          id: true,
          signupBonus: true,
          creditsPerListing: true,
          referrerReward: true,
          refereeBonus: true,
          graceListings: true,
          listingCostCredits: true,
          listingVisibilityDays: true,
          newUserGrantListings: true,
          newUserGrantDays: true,
          refereeGrantListings: true,
          referralTiers: true,
          campaignBonusMultiplier: true,
          campaignStartAt: true,
          campaignEndAt: true,
          fraudAutoHoldScore: true,
          enableCreditExpiry: true,
          maxReferralsPerUser: true,
          referralExpiryDays: true,
          dailyEarnCap: true,
          isActive: true,
          updatedAt: true,
        },
      });
    })();
    if (!config) {
      config = await this.prisma.creditConfig.create({
        data: {
          id: "singleton",
          signupBonus: 5,
          creditsPerListing: 1,
          referrerReward: 2,
          refereeBonus: 1,
          graceListings: 2,
          referralExpiryDays: 30,
          // New policy defaults
          listingCostCredits: 1,
          listingVisibilityDays: 30,
          ...(hasPostCols ? { postCostCredits: 1, postVisibilityDays: 30 } : {}),
          newUserGrantListings: 5,
          newUserGrantDays: 30,
          campaignBonusMultiplier: 1.0,
          fraudAutoHoldScore: 70,
          enableCreditExpiry: true,
        },
      });
    }
    // Self-heal clearly invalid configs to avoid broken signup grants / posting UX.
    // We do NOT overwrite valid admin tuning; we only repair out-of-range values.
    const patch: Prisma.CreditConfigUpdateInput = {};
    const d = ReferralsService.DEFAULT_POLICY;

    if (!config.listingCostCredits || config.listingCostCredits < 1)
      patch.listingCostCredits = d.listingCostCredits;
    if (!config.listingVisibilityDays || config.listingVisibilityDays < 1)
      patch.listingVisibilityDays = d.listingVisibilityDays;
    const postCostCredits = (config as any).postCostCredits as
      | number
      | undefined;
    const postVisibilityDays = (config as any).postVisibilityDays as
      | number
      | undefined;
    if (!postCostCredits || postCostCredits < 1)
      hasPostCols ? ((patch as any).postCostCredits = d.listingCostCredits) : null;
    if (!postVisibilityDays || postVisibilityDays < 1)
      hasPostCols ? ((patch as any).postVisibilityDays = d.listingVisibilityDays) : null;
    // `0` listings means no signup credits — breaks posting for every new user. Treat as invalid.
    if (config.newUserGrantListings == null || config.newUserGrantListings < 1)
      patch.newUserGrantListings = d.newUserGrantListings;
    if (!config.newUserGrantDays || config.newUserGrantDays < 1)
      patch.newUserGrantDays = d.newUserGrantDays;
    if (config.referrerReward == null || config.referrerReward < 0)
      patch.referrerReward = d.referrerReward;
    if (config.refereeBonus == null || config.refereeBonus < 0)
      patch.refereeBonus = d.refereeBonus;
    if (!config.referralExpiryDays || config.referralExpiryDays < 1)
      patch.referralExpiryDays = d.referralExpiryDays;
    if (config.enableCreditExpiry == null)
      patch.enableCreditExpiry = d.enableCreditExpiry;

    if (Object.keys(patch).length > 0) {
      this.logger.warn(
        `Repairing invalid CreditConfig values (id=${config.id}): ${Object.keys(patch).join(", ")}`,
      );
      config = await this.prisma.creditConfig.update({
        where: { id: config.id },
        data: patch,
      });
    }

    // Keep post* fields as canonical; mirror to legacy listing* fields for compatibility.
    const canonicalCost = Math.max(
      1,
      ((config as any).postCostCredits as number | undefined) ??
        config.listingCostCredits,
    );
    const canonicalVisibility = Math.max(
      1,
      ((config as any).postVisibilityDays as number | undefined) ??
        config.listingVisibilityDays,
    );
    if (
      config.listingCostCredits !== canonicalCost ||
      config.listingVisibilityDays !== canonicalVisibility
    ) {
      config = await this.prisma.creditConfig.update({
        where: { id: config.id },
        data: {
          listingCostCredits: canonicalCost,
          listingVisibilityDays: canonicalVisibility,
          ...(hasPostCols
            ? ({
                postCostCredits: canonicalCost,
                postVisibilityDays: canonicalVisibility,
              } as any)
            : {}),
        },
      });
    }

    // Keep legacy `signupBonus`/`creditsPerListing` aligned with canonical fields.
    const synced = await this.syncCanonicalSignupFields(config.id);
    return this.withPostAliases(synced ?? config);
  }

  /**
   * Canonical free credits at signup = newUserGrantListings × listingCostCredits.
   * Keeps legacy `signupBonus` aligned when config is updated.
   */
  private async syncCanonicalSignupFields(configId: string) {
    const row = await this.prisma.creditConfig.findUnique({
      where: { id: configId },
    });
    if (!row) return null;
    const hasPostCols = await this.hasPostPolicyColumns();
    const listingCost = Math.max(
      1,
      ((row as any).postCostCredits as number | undefined) ??
        row.listingCostCredits,
    );
    const grantListings = Math.max(0, row.newUserGrantListings);
    const expectedSignup = grantListings * listingCost;
    if (
      row.signupBonus !== expectedSignup ||
      row.creditsPerListing !== listingCost
    ) {
      return this.prisma.creditConfig.update({
        where: { id: configId },
        data: {
          signupBonus: expectedSignup,
          creditsPerListing: listingCost,
          ...(row.listingCostCredits !== listingCost
            ? { listingCostCredits: listingCost }
            : {}),
          ...(((row as any).postCostCredits as number | undefined) !==
          listingCost
            ? hasPostCols
              ? ({ postCostCredits: listingCost } as any)
              : {}
            : {}),
        },
      });
    }
    return row;
  }

  async updateConfig(data: Prisma.CreditConfigUpdateInput) {
    const config = await this.getConfig();
    const updated = await this.prisma.creditConfig.update({
      where: { id: config.id },
      data,
    });
    const synced = await this.syncCanonicalSignupFields(updated.id);
    return synced ?? updated;
  }

  /** UI-ready policy (also embedded in getPublicConfig). */
  buildPublicPolicy(config: {
    listingCostCredits: number;
    newUserGrantListings: number;
    newUserGrantDays: number;
    listingVisibilityDays: number;
    referrerReward: number;
    refereeBonus: number;
    referralExpiryDays: number;
    enableCreditExpiry: boolean;
  }) {
    const listingCost = Math.max(1, config.listingCostCredits);
    const grantListings = Math.max(0, config.newUserGrantListings);
    return {
      listingCostCredits: listingCost,
      postCostCredits: listingCost,
      freePostingCreditsAmount: grantListings * listingCost,
      newUserGrantListings: grantListings,
      newUserGrantDays: config.newUserGrantDays,
      listingVisibilityDays: config.listingVisibilityDays,
      postVisibilityDays: config.listingVisibilityDays,
      referrerReward: config.referrerReward,
      refereeBonus: config.refereeBonus,
      referralExpiryDays: config.referralExpiryDays,
      enableCreditExpiry: config.enableCreditExpiry,
      /** Referee welcome bonus from referral is credited after first approved listing. */
      refereeRewardTiming: "first_approved_listing" as const,
    };
  }

  async getPublicConfig() {
    const config = await this.getConfig();
    const policy = this.buildPublicPolicy(config);
    return {
      rewardReferrer: config.referrerReward,
      rewardReferee: config.refereeBonus,
      expiryDays: config.referralExpiryDays,
      // Backward-compatible fields for existing UI/admin screens.
      ...config,
      policy,
    };
  }

  async adminSetCampaign(data: AdminSetCampaignDto) {
    return this.updateConfig({
      campaignBonusMultiplier: data.multiplier,
      campaignStartAt: new Date(data.startAt),
      campaignEndAt: new Date(data.endAt),
    });
  }

  async adminClearCampaign() {
    return this.updateConfig({
      campaignStartAt: null,
      campaignEndAt: null,
    });
  }

  // ── Referral Code ────────────────────────────────────────────────────────────

  /**
   * Returns the user's existing referral code, or generates a new one.
   * Uses a retry loop to handle the (unlikely) collision case.
   */
  async getOrCreateCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!user) throw new NotFoundException("User not found");
    if (user.referralCode) return user.referralCode;

    for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
      const code = generateCode();
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { referralCode: code },
        });
        this.logger.log(`Generated referral code ${code} for user ${userId}`);
        return code;
      } catch (err: any) {
        if (err?.code === "P2002" && attempt < MAX_CODE_RETRIES) {
          this.logger.warn(
            `Referral code collision on attempt ${attempt}, retrying...`,
          );
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      "Failed to generate a unique referral code after max retries",
    );
  }

  async backfillMissingReferralCodes(batchSize = 200): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { referralCode: null },
      select: { id: true },
      take: batchSize,
      orderBy: { createdAt: "asc" },
    });
    if (users.length === 0) return 0;

    let updated = 0;
    for (const user of users) {
      try {
        await this.getOrCreateCode(user.id);
        updated += 1;
      } catch (err) {
        this.logger.error(
          `Failed referral-code backfill for user ${user.id}`,
          err as Error,
        );
      }
    }
    this.logger.log(
      `Backfilled referral codes for ${updated}/${users.length} users`,
    );
    return updated;
  }

  async getMyReferralInfo(userId: string, appBaseUrl: string) {
    const code = await this.getOrCreateCode(userId);
    const shareUrl = `${appBaseUrl}/register?referralCode=${encodeURIComponent(code)}`;
    const stats = await this.getReferralStats(userId);
    const tierStatus = await this.getTierStatus(userId);
    return { code, shareUrl, stats, tierStatus };
  }

  // ── Tier Management ─────────────────────────────────────────────────────────

  async getTierStatus(userId: string) {
    const config = await this.getConfig();
    const completedCount = await this.prisma.referralRecord.count({
      where: { referrerId: userId, status: ReferralStatus.COMPLETED },
    });

    const tiers = (config.referralTiers as any[]) || [
      { name: "Standard", minReferrals: 0, multiplier: 1.0, color: "#64748b" },
    ];

    // Sort tiers by minReferrals descending to find the current one easily
    const sortedTiers = [...tiers].sort(
      (a, b) => b.minReferrals - a.minReferrals,
    );

    const currentTier =
      sortedTiers.find((t) => completedCount >= t.minReferrals) ||
      sortedTiers[sortedTiers.length - 1];
    const nextTier = [...tiers]
      .sort((a, b) => a.minReferrals - b.minReferrals)
      .find((t) => t.minReferrals > completedCount);

    return {
      currentTier,
      nextTier,
      completedCount,
      progressToNext: nextTier
        ? Math.min(100, (completedCount / nextTier.minReferrals) * 100)
        : 100,
      referralsToNextTier: nextTier
        ? nextTier.minReferrals - completedCount
        : 0,
    };
  }

  // ── Attribution ──────────────────────────────────────────────────────────────

  /**
   * Referrer reward including tier + campaign multipliers.
   * Used when a referee joins (immediate credit) and when qualifying FLAGGED referrals.
   */
  private computeReferrerRewardWithMultiplier(
    config: {
      referralTiers: unknown;
      referrerReward: number;
      campaignStartAt: Date | null;
      campaignEndAt: Date | null;
      campaignBonusMultiplier: number | null;
    },
    completedReferralCount: number,
  ) {
    const tiers = (config.referralTiers as any[]) || [];
    const applicableTier = tiers
      .sort((a: any, b: any) => b.minReferrals - a.minReferrals)
      .find((t: any) => completedReferralCount >= t.minReferrals);
    const campaignMultiplier = this.getActiveCampaignMultiplier(config);
    const multiplier = (applicableTier?.multiplier || 1) * campaignMultiplier;
    const effectiveReferrerReward = Math.floor(
      config.referrerReward * multiplier,
    );
    return { multiplier, effectiveReferrerReward };
  }

  /**
   * Records a referral when a new user registers with a referral code.
   * Safety checks: self-referral, already referred, code exists, cap enforcement.
   */
  async recordReferral(
    refereeId: string,
    referralCode: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    type ReferralAttributionNoopReason =
      | "DISABLED"
      | "CODE_NOT_FOUND"
      | "SELF_REFERRAL"
      | "ALREADY_REFERRED"
      | "CAP_REACHED"
      | "UNKNOWN";

    const normalizedCode = normalizeReferralCode(referralCode);
    const config = await this.getConfig();
    if (!config.isActive) {
      this.logger.warn(
        "recordReferral skipped: referrals are disabled (CreditConfig.isActive = false).",
      );
      return {
        ok: false as const,
        reason: "DISABLED" as ReferralAttributionNoopReason,
      };
    }

    const referrer = await this.prisma.user.findFirst({
      where: {
        referralCode: {
          equals: normalizedCode,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    if (!referrer) {
      this.logger.warn(`Referral code "${normalizedCode}" not found`);
      return {
        ok: false as const,
        reason: "CODE_NOT_FOUND" as ReferralAttributionNoopReason,
      };
    }

    // Self-referral guard
    if (referrer.id === refereeId) {
      this.logger.warn(`Self-referral attempt by user ${refereeId}`);
      return {
        ok: false as const,
        reason: "SELF_REFERRAL" as ReferralAttributionNoopReason,
      };
    }

    // Already referred guard (unique constraint on refereeId, but check first for a clean error)
    const existing = await this.prisma.referralRecord.findUnique({
      where: { refereeId },
    });
    if (existing) {
      this.logger.warn(`User ${refereeId} already has a referral record`);
      return {
        ok: false as const,
        reason: "ALREADY_REFERRED" as ReferralAttributionNoopReason,
        existingReferralId: existing.id,
      };
    }

    // Enforce max referrals per referrer
    if (config.maxReferralsPerUser != null) {
      const referrerCount = await this.prisma.referralRecord.count({
        where: {
          referrerId: referrer.id,
          status: { notIn: [ReferralStatus.FLAGGED, ReferralStatus.REJECTED] },
        },
      });
      if (referrerCount >= config.maxReferralsPerUser) {
        this.logger.warn(
          `Referrer ${referrer.id} has hit the max referral cap`,
        );
        return {
          ok: false as const,
          reason: "CAP_REACHED" as ReferralAttributionNoopReason,
        };
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.referralExpiryDays);

    const fraudScore = await this.calculateFraudScore(referrer.id, ipAddress);

    const record = await this.prisma.referralRecord.create({
      data: {
        referrerId: referrer.id,
        refereeId,
        referralCode: normalizedCode,
        expiresAt,
        referrerReward: config.referrerReward,
        refereeReward: config.refereeBonus,
        fraudScore,
        signupIp: ipAddress,
        userAgent,
        status: ReferralStatus.PENDING,
      },
    });

    await this.prisma.user.update({
      where: { id: refereeId },
      data: { referredById: referrer.id },
    });

    this.logger.log(
      `Referral recorded (PENDING): ${referrer.id} → ${refereeId} [code: ${normalizedCode}, fraudScore: ${fraudScore}]`,
    );

    await this.notificationsService.sendNotification({
      userId: referrer.id,
      type: "REFERRAL_SIGNUP",
      title: "Someone joined with your referral link",
      message:
        "When they publish their first post, you both earn bonus credits (referral program rules apply).",
      level: "info",
      actionUrl: "/referrals",
    });

    return { ok: true as const, recordId: record.id };
  }

  async adminRepairAttribution(
    refereeId: string,
    referralCode: string,
    ipAddress?: string,
  ) {
    // Admin repair is intentionally a thin wrapper: all business rules still enforced in recordReferral.
    // This keeps it idempotent and prevents admins from creating inconsistent state.
    const result = await this.recordReferral(
      refereeId,
      referralCode,
      ipAddress,
    );
    return result ?? { ok: false as const, reason: "UNKNOWN" as const };
  }

  // ── Qualification (first approved property) ─────────────────────────────────

  /**
   * When the referee gets their first property approved/published, reward the referrer.
   * Idempotent via `referral:reward:{referralId}:referrer`.
   * Legacy: if the referrer was already paid at signup (old `referral-signup-referrer:*` key), only the missing side is credited.
   */
  async completeReferralOnFirstProperty(refereeId: string): Promise<boolean> {
    const run = async (tx: Prisma.TransactionClient): Promise<boolean> => {
      const record = await tx.referralRecord.findUnique({
        where: { refereeId },
      });
      if (!record) return false;

      const allowed: ReferralStatus[] = [
        ReferralStatus.PENDING,
        ReferralStatus.IN_PROGRESS,
        ReferralStatus.FLAGGED,
        ReferralStatus.UNDER_REVIEW,
      ];
      if (!allowed.includes(record.status)) return false;

      if (record.expiresAt < new Date()) {
        await tx.referralRecord.update({
          where: { id: record.id },
          data: { status: ReferralStatus.EXPIRED },
        });
        return false;
      }

      const approvedCount = await tx.property.count({
        where: {
          ownerId: refereeId,
          isDeleted: false,
          status: "PUBLISHED",
          verificationStatus: "VERIFIED",
        },
      });
      if (approvedCount === 0) return false;

      const config = await tx.creditConfig.findFirst();
      if (!config) throw new NotFoundException("Credit config not found");

      const completedCount = await tx.referralRecord.count({
        where: {
          referrerId: record.referrerId,
          status: ReferralStatus.COMPLETED,
        },
      });

      const { multiplier, effectiveReferrerReward } =
        this.computeReferrerRewardWithMultiplier(config, completedCount);

      const claimed = await tx.referralRecord.updateMany({
        where: {
          id: record.id,
          status: { in: allowed },
          qualifiedAt: null,
        },
        data: {
          status: ReferralStatus.COMPLETED,
          qualifiedAt: new Date(),
          referrerReward: effectiveReferrerReward,
          // Policy: referees do not receive referral credits; only the referrer is rewarded.
          refereeReward: 0,
        },
      });
      if (claimed.count === 0) return false;

      const refreshed = await tx.referralRecord.findUnique({
        where: { id: record.id },
      });
      if (!refreshed) return false;

      const referrerKeyNew = referralRewardReferrerKey(refreshed.id);

      const referrerPaidLegacy =
        (await tx.creditTransaction.findFirst({
          where: {
            referralId: refreshed.id,
            userId: refreshed.referrerId,
            type: CreditTransactionType.REFERRAL_REWARD,
          },
          select: { id: true },
        })) != null;

      const tasks: Promise<unknown>[] = [];

      if (!referrerPaidLegacy && effectiveReferrerReward > 0) {
        tasks.push(
          this.creditsService.creditTokens(
            refreshed.referrerId,
            {
              amount: effectiveReferrerReward,
              type: CreditTransactionType.REFERRAL_REWARD,
              description: `Referral reward — friend’s first post approved (${multiplier}x)`,
              referralId: refreshed.id,
              metadata: {
                refereeId,
                multiplier,
                phase: "first_approved_property",
              },
              idempotencyKey: referrerKeyNew,
              source: "REFERRAL",
            },
            { tx },
          ),
        );
      }

      await Promise.all(tasks);

      return true;
    };

    const done = await this.prisma.$transaction(async (tx) => run(tx));
    if (done) {
      const record = await this.prisma.referralRecord.findUnique({
        where: { refereeId },
        select: {
          referrerId: true,
          refereeId: true,
          referrerReward: true,
          refereeReward: true,
        },
      });
      if (record) {
        await Promise.all([
          this.notificationsService.sendNotification({
            userId: record.referrerId,
            type: "REFERRAL_QUALIFIED",
            title: `You earned ${record.referrerReward} credits`,
            message:
              "Your referral had their first post approved. Bonus credits added to your wallet.",
            level: "success",
            actionUrl: "/credits",
          }),
        ]);
      }
    }
    return done;
  }

  /** @deprecated Use {@link completeReferralOnFirstProperty} — kept for admin/manual call sites. */
  async qualifyReferral(
    refereeId: string,
    _options?: { idempotencyPrefix?: string },
  ) {
    return this.completeReferralOnFirstProperty(refereeId);
  }

  /**
   * Safety net: pending referrals whose referee already has ≥1 approved/published property.
   */
  async reconcilePendingQualifications(batchSize = 200): Promise<number> {
    const candidates = await this.prisma.referralRecord.findMany({
      where: {
        status: ReferralStatus.PENDING,
        expiresAt: { gte: new Date() },
      },
      select: { refereeId: true },
      take: batchSize,
      orderBy: { createdAt: "asc" },
    });
    if (candidates.length === 0) return 0;

    let reconciled = 0;
    for (const candidate of candidates) {
      const posted = await this.prisma.property.count({
        where: {
          ownerId: candidate.refereeId,
          isDeleted: false,
          status: "PUBLISHED",
          verificationStatus: "VERIFIED",
        },
      });
      if (posted === 0) continue;

      try {
        const ok = await this.completeReferralOnFirstProperty(
          candidate.refereeId,
        );
        if (ok) reconciled += 1;
      } catch (err) {
        this.logger.error(
          `Failed to reconcile referral qualification for referee ${candidate.refereeId}`,
          err as Error,
        );
      }
    }

    if (reconciled > 0) {
      this.logger.log(`Reconciled ${reconciled} referral qualification(s)`);
    }
    return reconciled;
  }

  /**
   * Idempotent migration:
   * - Users with **no** wallet history: +5 FREE (30d), then −1 per existing property (aggregated), keyed `migration:signup:*` / `migration:listings_aggregate:*`.
   * - Pending referrals where the referee already has approved posts: complete + rewards (canonical referral keys).
   */
  async runLegacyCreditsReferralMigration(
    batchSize = 200,
  ): Promise<{ signupAdjusted: number; referralsReconciled: number }> {
    let signupAdjusted = 0;
    let referralsReconciled = 0;

    const coldUsers = await this.prisma.user.findMany({
      where: {
        creditBalance: 0,
        creditTransactions: { none: {} },
      },
      select: { id: true },
      take: batchSize,
      orderBy: { createdAt: "asc" },
    });

    for (const user of coldUsers) {
      const signupKey = migrationSignupKey(user.id);
      const already = await this.prisma.creditTransaction.findFirst({
        where: { idempotencyKey: signupKey },
        select: { id: true },
      });
      if (already) continue;

      const postCount = await this.prisma.property.count({
        where: { ownerId: user.id, isDeleted: false },
      });

      await this.prisma.$transaction(async (tx) => {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await this.creditsService.creditTokens(
          user.id,
          {
            amount: 5,
            type: CreditTransactionType.SIGNUP_BONUS,
            description:
              "Migration: signup free credits (valid 30 days from migration)",
            expiresAt,
            metadata: {
              migration: true,
              migrationVersion: 2,
              case: postCount === 0 ? "A" : "B",
            },
            idempotencyKey: signupKey,
            source: "SIGNUP",
          },
          { tx },
        );
        if (postCount > 0) {
          // Spec: remainingCredits = max(5 - posts, 0). We never allow negative balances.
          const debitAmount = Math.min(postCount, 5);
          await this.creditsService.debitTokens(
            user.id,
            {
              amount: debitAmount,
              type: "POST_SPEND" as CreditTransactionType,
              description: `Migration: post debits for ${postCount} existing post(s)`,
              metadata: { migration: true, postCount, debitAmount },
              idempotencyKey: migrationListingsAggregateKey(user.id),
              source: "POST_DEBIT",
            },
            { tx },
          );
        }
      });
      signupAdjusted += 1;
    }

    const pendingReferrals = await this.prisma.referralRecord.findMany({
      where: { status: ReferralStatus.PENDING, expiresAt: { gte: new Date() } },
      select: { id: true, refereeId: true },
      take: batchSize,
      orderBy: { createdAt: "asc" },
    });

    for (const referral of pendingReferrals) {
      const posts = await this.prisma.property.count({
        where: {
          ownerId: referral.refereeId,
          isDeleted: false,
          status: "PUBLISHED",
          verificationStatus: "VERIFIED",
        },
      });
      if (posts === 0) continue;
      try {
        const ok = await this.completeReferralOnFirstProperty(
          referral.refereeId,
        );
        if (ok) referralsReconciled += 1;
      } catch (err) {
        this.logger.error(
          `Migration referral failed for referee ${referral.refereeId}`,
          err as Error,
        );
      }
    }

    return { signupAdjusted, referralsReconciled };
  }

  /**
   * Mark PENDING referrals as EXPIRED when the referee did not post within the referral window.
   */
  async expireStaleReferrals(batchSize = 500): Promise<number> {
    const now = new Date();
    const stale = await this.prisma.referralRecord.findMany({
      where: {
        status: ReferralStatus.PENDING,
        expiresAt: { lt: now },
      },
      select: { id: true },
      take: batchSize,
      orderBy: { expiresAt: "asc" },
    });
    if (stale.length === 0) return 0;

    const result = await this.prisma.referralRecord.updateMany({
      where: {
        id: { in: stale.map((s) => s.id) },
        status: ReferralStatus.PENDING,
      },
      data: { status: ReferralStatus.EXPIRED },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} stale referral record(s)`);
    }
    return result.count;
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  async getReferralStats(userId: string) {
    const [
      total,
      pending,
      completed,
      totalEarned,
      flagged,
      rejected,
      expired,
      inProgress,
      underReview,
    ] = await Promise.all([
      this.prisma.referralRecord.count({ where: { referrerId: userId } }),
      this.prisma.referralRecord.count({
        where: {
          referrerId: userId,
          status: { in: [ReferralStatus.PENDING, ReferralStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.referralRecord.count({
        where: { referrerId: userId, status: ReferralStatus.COMPLETED },
      }),
      this.prisma.creditTransaction.aggregate({
        where: { userId, type: CreditTransactionType.REFERRAL_REWARD },
        _sum: { amount: true },
      }),
      this.prisma.referralRecord.count({
        where: { referrerId: userId, status: ReferralStatus.FLAGGED },
      }),
      this.prisma.referralRecord.count({
        where: { referrerId: userId, status: ReferralStatus.REJECTED },
      }),
      this.prisma.referralRecord.count({
        where: { referrerId: userId, status: ReferralStatus.EXPIRED },
      }),
      this.prisma.referralRecord.count({
        where: { referrerId: userId, status: ReferralStatus.IN_PROGRESS },
      }),
      this.prisma.referralRecord.count({
        where: { referrerId: userId, status: ReferralStatus.UNDER_REVIEW },
      }),
    ]);

    return {
      total,
      pending,
      completed,
      // Keep backward-compatible field used by current UI.
      qualified: completed,
      expired,
      flagged,
      rejected,
      inProgress,
      underReview,
      totalEarned: totalEarned._sum.amount ?? 0,
    };
  }

  async getReferralSummary(userId: string) {
    const stats = await this.getReferralStats(userId);
    return {
      totalInvited: stats.total,
      completed: stats.completed ?? stats.qualified,
      pending: stats.pending,
      totalEarnedCredits: stats.totalEarned,
    };
  }

  async getReferralList(userId: string, page = 1, limit = 20) {
    const { items, pagination } = await this.getMyReferrals(
      userId,
      page,
      limit,
    );
    return {
      items: items.map((item) => ({
        refereeName: item.referee?.fullName ?? "Anonymous User",
        status: item.status,
        rewardEarned:
          item.status === ReferralStatus.COMPLETED ? item.referrerReward : 0,
        createdAt: item.createdAt,
      })),
      pagination,
    };
  }

  async getMyReferrals(userId: string, page = 1, limit = 20) {
    const [items, total] = await Promise.all([
      this.prisma.referralRecord.findMany({
        where: { referrerId: userId },
        include: {
          referee: { select: { id: true, fullName: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referralRecord.count({ where: { referrerId: userId } }),
    ]);
    return {
      items,
      pagination: { total, page, size: limit, pages: Math.ceil(total / limit) },
    };
  }

  async getLeaderboard(limit = 10) {
    // Aggregate top referrers by count of COMPLETED referrals
    const results = await this.prisma.referralRecord.groupBy({
      by: ["referrerId"],
      where: { status: ReferralStatus.COMPLETED },
      _count: { referrerId: true },
      orderBy: { _count: { referrerId: "desc" } },
      take: limit,
    });

    if (results.length === 0) return [];

    const userIds = results.map((r) => r.referrerId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    return results.map((r, index) => ({
      rank: index + 1,
      userId: r.referrerId,
      name: userMap.get(r.referrerId)?.fullName ?? "Anonymous",
      qualifiedReferrals: r._count.referrerId,
    }));
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  private async buildReferralProgressForRecord(record: {
    id: string;
    referrerId: string;
    refereeId: string;
    status: ReferralStatus;
    createdAt: Date;
    expiresAt: Date;
    qualifiedAt: Date | null;
  }) {
    const now = new Date();

    const [
      totalPosts,
      firstPost,
      totalApprovedPosts,
      firstApprovedPost,
      signupBonusTxn,
      referralTxns,
    ] = await Promise.all([
      this.prisma.property.count({
        where: { ownerId: record.refereeId, isDeleted: false },
      }),
      this.prisma.property.findFirst({
        where: { ownerId: record.refereeId, isDeleted: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true },
      }),
      this.prisma.property.count({
        where: {
          ownerId: record.refereeId,
          isDeleted: false,
          status: PropertyStatus.PUBLISHED,
          verificationStatus: VerificationStatus.VERIFIED,
        },
      }),
      this.prisma.property.findFirst({
        where: {
          ownerId: record.refereeId,
          isDeleted: false,
          status: PropertyStatus.PUBLISHED,
          verificationStatus: VerificationStatus.VERIFIED,
        },
        orderBy: { publishedAt: "asc" },
        select: { id: true, publishedAt: true, createdAt: true },
      }),
      this.prisma.creditTransaction.findFirst({
        where: {
          userId: record.refereeId,
          type: CreditTransactionType.SIGNUP_BONUS,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, amount: true, expiresAt: true, createdAt: true },
      }),
      this.prisma.creditTransaction.findMany({
        where: { referralId: record.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          userId: true,
          type: true,
          direction: true,
          amount: true,
          idempotencyKey: true,
          createdAt: true,
        },
      }),
    ]);

    const referrerRewardTxn = referralTxns.find(
      (t) =>
        t.userId === record.referrerId &&
        t.type === CreditTransactionType.REFERRAL_REWARD,
    );
    const refereeBonusTxn = referralTxns.find(
      (t) =>
        t.userId === record.refereeId &&
        t.type === CreditTransactionType.REFEREE_BONUS,
    );

    const expired =
      record.status === ReferralStatus.EXPIRED ||
      (record.expiresAt < now &&
        totalApprovedPosts === 0 &&
        record.status !== ReferralStatus.COMPLETED);

    return {
      referralId: record.id,
      status: record.status,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      qualifiedAt: record.qualifiedAt,
      refereePosting: {
        totalPosts,
        firstPostAt: firstPost?.createdAt ?? null,
        firstPostId: firstPost?.id ?? null,
        approvedPosts: totalApprovedPosts,
        firstApprovedPostAt:
          firstApprovedPost?.publishedAt ??
          firstApprovedPost?.createdAt ??
          null,
        firstApprovedPostId: firstApprovedPost?.id ?? null,
      },
      payouts: {
        referrerRewardIssued: !!referrerRewardTxn,
        refereeBonusIssued: !!refereeBonusTxn,
        referrerRewardAt: referrerRewardTxn?.createdAt ?? null,
        refereeBonusAt: refereeBonusTxn?.createdAt ?? null,
      },
      steps: {
        signupAttributed: true,
        welcomeCreditsGranted: !!signupBonusTxn,
        welcomeCreditsAmount: signupBonusTxn?.amount ?? null,
        welcomeCreditsExpiresAt: signupBonusTxn?.expiresAt ?? null,
        firstListingCreated: totalApprovedPosts > 0,
        referralRewardsCredited: !!referrerRewardTxn && !!refereeBonusTxn,
        expired,
      },
    };
  }

  async getMyReferralProgress(userId: string) {
    const record = await this.prisma.referralRecord.findUnique({
      where: { refereeId: userId },
      select: {
        id: true,
        referrerId: true,
        refereeId: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        qualifiedAt: true,
      },
    });
    if (!record) return null;
    return this.buildReferralProgressForRecord(record);
  }

  async adminGetReferralDetails(id: string) {
    const record = await this.prisma.referralRecord.findUnique({
      where: { id },
      include: {
        referrer: { select: { id: true, fullName: true, email: true } },
        referee: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!record) throw new NotFoundException("Referral record not found");

    const progress = await this.buildReferralProgressForRecord({
      id: record.id,
      referrerId: record.referrerId,
      refereeId: record.refereeId,
      status: record.status,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      qualifiedAt: record.qualifiedAt ?? null,
    });

    const creditTransactions = await this.prisma.creditTransaction.findMany({
      where: { referralId: record.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        userId: true,
        type: true,
        direction: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        description: true,
        idempotencyKey: true,
        source: true,
        createdAt: true,
      },
    });

    const hasReferrerRewardTxn = creditTransactions.some(
      (t) =>
        t.userId === record.referrerId &&
        t.type === CreditTransactionType.REFERRAL_REWARD,
    );
    const hasRefereeBonusTxn = creditTransactions.some(
      (t) =>
        t.userId === record.refereeId &&
        t.type === CreditTransactionType.REFEREE_BONUS,
    );

    return {
      record,
      refereePosting: progress.refereePosting,
      creditTransactions,
      derived: {
        hasReferrerRewardTxn,
        hasRefereeBonusTxn,
      },
      progress,
    };
  }

  async adminListReferrals(query: ListReferralsQueryDto) {
    const {
      page = 1,
      limit = 20,
      status,
      referrerId,
      q,
      createdFrom,
      createdTo,
      includeProgress,
    } = query;
    const where: any = {};
    if (status) where.status = status;
    if (referrerId) where.referrerId = referrerId;
    if (createdFrom || createdTo) {
      const bounds: any = {};
      if (createdFrom) bounds.gte = new Date(createdFrom);
      if (createdTo) bounds.lte = new Date(createdTo);
      where.createdAt = bounds;
    }
    if (q && q.trim().length > 0) {
      const term = q.trim();
      where.OR = [
        { referrer: { fullName: { contains: term, mode: "insensitive" } } },
        { referrer: { email: { contains: term, mode: "insensitive" } } },
        { referee: { fullName: { contains: term, mode: "insensitive" } } },
        { referee: { email: { contains: term, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.referralRecord.findMany({
        where,
        include: {
          referrer: { select: { id: true, fullName: true, email: true } },
          referee: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referralRecord.count({ where }),
    ]);

    if (!includeProgress || items.length === 0) {
      return {
        items,
        pagination: {
          total,
          page,
          size: limit,
          pages: Math.ceil(total / limit),
        },
      };
    }

    const referralIds = items.map((r) => r.id);
    const refereeIds = items.map((r) => r.refereeId);
    const referrerIds = items.map((r) => r.referrerId);

    const [postsAgg, payoutTxns] = await Promise.all([
      this.prisma.property.groupBy({
        by: ["ownerId"],
        where: { ownerId: { in: refereeIds }, isDeleted: false },
        _count: { _all: true },
      }),
      this.prisma.creditTransaction.findMany({
        where: {
          referralId: { in: referralIds },
          type: {
            in: [
              CreditTransactionType.REFERRAL_REWARD,
              CreditTransactionType.REFEREE_BONUS,
            ],
          },
          userId: { in: [...refereeIds, ...referrerIds] },
        },
        select: { referralId: true, userId: true, type: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    ]);

    const postsByRefereeId = new Map<string, number>();
    for (const row of postsAgg) {
      postsByRefereeId.set(row.ownerId ?? "", row._count._all ?? 0);
    }

    const payoutByReferralId = new Map<
      string,
      {
        referrerRewardAt: Date | null;
        refereeBonusAt: Date | null;
        referrerRewardIssued: boolean;
        refereeBonusIssued: boolean;
      }
    >();
    for (const t of payoutTxns) {
      if (!t.referralId) continue;
      const current = payoutByReferralId.get(t.referralId) ?? {
        referrerRewardAt: null,
        refereeBonusAt: null,
        referrerRewardIssued: false,
        refereeBonusIssued: false,
      };
      if (t.type === CreditTransactionType.REFERRAL_REWARD) {
        current.referrerRewardIssued = true;
        current.referrerRewardAt = current.referrerRewardAt ?? t.createdAt;
      }
      if (t.type === CreditTransactionType.REFEREE_BONUS) {
        current.refereeBonusIssued = true;
        current.refereeBonusAt = current.refereeBonusAt ?? t.createdAt;
      }
      payoutByReferralId.set(t.referralId, current);
    }

    const enriched = items.map((r) => {
      const totalPosts = postsByRefereeId.get(r.refereeId) ?? 0;
      const payouts = payoutByReferralId.get(r.id) ?? {
        referrerRewardAt: null,
        refereeBonusAt: null,
        referrerRewardIssued: false,
        refereeBonusIssued: false,
      };

      const expired =
        r.status === ReferralStatus.EXPIRED ||
        (r.expiresAt < new Date() &&
          totalPosts === 0 &&
          r.status !== ReferralStatus.COMPLETED);

      return {
        ...r,
        progressLite: {
          refereePosting: { totalPosts },
          payouts,
          steps: {
            signupAttributed: true,
            firstListingCreated: totalPosts > 0,
            referralRewardsCredited:
              payouts.referrerRewardIssued && payouts.refereeBonusIssued,
            expired,
          },
        },
      };
    });

    return {
      items: enriched,
      pagination: { total, page, size: limit, pages: Math.ceil(total / limit) },
    };
  }

  async adminUpdateReferral(id: string, dto: AdminUpdateReferralDto) {
    const record = await this.prisma.referralRecord.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException("Referral record not found");

    // If admin is manually qualifying a pending record, fire rewards
    if (
      dto.status === ReferralStatus.COMPLETED &&
      (record.status === ReferralStatus.PENDING ||
        record.status === ReferralStatus.IN_PROGRESS)
    ) {
      const posts = await this.prisma.property.count({
        where: { ownerId: record.refereeId, isDeleted: false },
      });
      if (posts === 0) {
        throw new UnprocessableEntityException(
          "Cannot complete referral: referee has not posted yet.",
        );
      }
      await this.completeReferralOnFirstProperty(record.refereeId);
      return this.prisma.referralRecord.findUnique({ where: { id } });
    }

    // Admin can force-expire only PENDING referrals (do not retroactively change completed payouts).
    if (dto.status === ReferralStatus.EXPIRED) {
      if (record.status !== ReferralStatus.PENDING) {
        throw new BadRequestException(
          "Can only expire referrals that are currently PENDING.",
        );
      }
    }

    // Prevent flipping completed rewards to other states (audit integrity).
    if (
      record.status === ReferralStatus.COMPLETED &&
      dto.status &&
      dto.status !== ReferralStatus.COMPLETED
    ) {
      throw new BadRequestException(
        "Cannot change status of a COMPLETED referral.",
      );
    }

    return this.prisma.referralRecord.update({
      where: { id },
      data: {
        status: dto.status as ReferralStatus,
        adminNote: dto.adminNote,
        fraudScore: dto.fraudScore,
      },
    });
  }

  async adminGetStats() {
    const [
      total,
      qualified,
      pending,
      fraudulent,
      totalReferralCreditsDistributed,
    ] = await Promise.all([
      this.prisma.referralRecord.count(),
      this.prisma.referralRecord.count({
        where: { status: ReferralStatus.COMPLETED },
      }),
      this.prisma.referralRecord.count({
        where: {
          status: { in: [ReferralStatus.PENDING, ReferralStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.referralRecord.count({
        where: {
          status: { in: [ReferralStatus.FLAGGED, ReferralStatus.REJECTED] },
        },
      }),
      this.prisma.creditTransaction.aggregate({
        where: { type: CreditTransactionType.REFERRAL_REWARD },
        _sum: { amount: true },
      }),
    ]);

    // Quality metrics for admin UX/support: do completed referrals have both payouts?
    const completedReferralIds = await this.prisma.referralRecord.findMany({
      where: { status: ReferralStatus.COMPLETED },
      select: { id: true, createdAt: true, qualifiedAt: true },
      orderBy: { qualifiedAt: "desc" },
      take: 1000, // bounded for admin stats; enough for stable trend
    });

    const ids = completedReferralIds.map((r) => r.id);
    const payoutTxns =
      ids.length === 0
        ? []
        : await this.prisma.creditTransaction.findMany({
            where: {
              referralId: { in: ids },
              type: {
                in: [
                  CreditTransactionType.REFERRAL_REWARD,
                  CreditTransactionType.REFEREE_BONUS,
                ],
              },
            },
            select: { referralId: true, type: true },
          });

    const payoutByReferralId = new Map<
      string,
      { hasReferrer: boolean; hasReferee: boolean }
    >();
    for (const t of payoutTxns) {
      if (!t.referralId) continue;
      const cur = payoutByReferralId.get(t.referralId) ?? {
        hasReferrer: false,
        hasReferee: false,
      };
      if (t.type === CreditTransactionType.REFERRAL_REWARD)
        cur.hasReferrer = true;
      if (t.type === CreditTransactionType.REFEREE_BONUS) cur.hasReferee = true;
      payoutByReferralId.set(t.referralId, cur);
    }

    let completedWithBothPayouts = 0;
    for (const id of ids) {
      const p = payoutByReferralId.get(id);
      if (p?.hasReferrer && p?.hasReferee) completedWithBothPayouts += 1;
    }

    // Time-to-qualify (in days) for the sampled completed referrals.
    const durationsMs = completedReferralIds
      .map((r) => {
        const q = r.qualifiedAt instanceof Date ? r.qualifiedAt.getTime() : NaN;
        const c = r.createdAt instanceof Date ? r.createdAt.getTime() : NaN;
        if (!Number.isFinite(q) || !Number.isFinite(c) || q < c) return null;
        return q - c;
      })
      .filter((v): v is number => v != null);
    durationsMs.sort((a, b) => a - b);
    const p50 = durationsMs.length
      ? durationsMs[Math.floor(durationsMs.length * 0.5)]
      : null;
    const p90 = durationsMs.length
      ? durationsMs[Math.floor(durationsMs.length * 0.9)]
      : null;

    return {
      total,
      qualified,
      pending,
      fraudulent,
      expired: total - qualified - pending - fraudulent,
      qualificationRate: total > 0 ? Math.round((qualified / total) * 100) : 0,
      totalCreditsDistributed: totalReferralCreditsDistributed._sum.amount ?? 0,
      payoutIntegrity: {
        sampleSizeCompleted: ids.length,
        completedWithBothPayouts,
        completedMissingAnyPayout: Math.max(
          0,
          ids.length - completedWithBothPayouts,
        ),
        integrityRate:
          ids.length > 0
            ? Math.round((completedWithBothPayouts / ids.length) * 100)
            : 0,
      },
      timeToQualifyDays: {
        sampleSizeCompletedWithQualifiedAt: durationsMs.length,
        p50: p50 != null ? Math.round((p50 / 86_400_000) * 10) / 10 : null,
        p90: p90 != null ? Math.round((p90 / 86_400_000) * 10) / 10 : null,
      },
    };
  }

  async adminDiagnostics(query: {
    refereeEmail?: string;
    referralCode?: string;
  }) {
    const normalizedRefereeEmail =
      typeof query.refereeEmail === "string" &&
      query.refereeEmail.trim().length > 0
        ? query.refereeEmail.trim().toLowerCase()
        : null;
    const normalizedCode =
      typeof query.referralCode === "string" &&
      query.referralCode.trim().length > 0
        ? normalizeReferralCode(query.referralCode)
        : null;

    const config = await this.getConfig();

    const [referee, referrerByCode] = await Promise.all([
      normalizedRefereeEmail
        ? this.prisma.user.findUnique({
            where: { email: normalizedRefereeEmail },
            select: {
              id: true,
              email: true,
              fullName: true,
              referralCode: true,
              referredById: true,
              createdAt: true,
            },
          })
        : Promise.resolve(null),
      normalizedCode
        ? this.prisma.user.findFirst({
            where: {
              referralCode: { equals: normalizedCode, mode: "insensitive" },
            },
            select: {
              id: true,
              email: true,
              fullName: true,
              referralCode: true,
              createdAt: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const referralRecord = referee
      ? await this.prisma.referralRecord.findUnique({
          where: { refereeId: referee.id },
          include: {
            referrer: {
              select: {
                id: true,
                email: true,
                fullName: true,
                referralCode: true,
              },
            },
            referee: { select: { id: true, email: true, fullName: true } },
          },
        })
      : null;

    const payoutTxns =
      referralRecord?.id != null
        ? await this.prisma.creditTransaction.findMany({
            where: { referralId: referralRecord.id },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              userId: true,
              type: true,
              amount: true,
              createdAt: true,
              idempotencyKey: true,
            },
          })
        : [];

    let derivedReason: string | null = null;
    if (!normalizedRefereeEmail) derivedReason = "MISSING_REFEREE_EMAIL";
    else if (!referee) derivedReason = "NO_REFEREE_USER";
    else if (!normalizedCode) derivedReason = "MISSING_REFERRAL_CODE";
    else if (!referrerByCode) derivedReason = "CODE_NOT_FOUND";
    else if (referrerByCode.id === referee.id) derivedReason = "SELF_REFERRAL";
    else if (referralRecord) derivedReason = "ALREADY_REFERRED";
    else if (!config.isActive) derivedReason = "DISABLED";
    else derivedReason = "UNKNOWN";

    return {
      inputs: {
        refereeEmail: normalizedRefereeEmail,
        referralCode: normalizedCode,
      },
      config: {
        isActive: config.isActive,
        maxReferralsPerUser: config.maxReferralsPerUser ?? null,
        referralExpiryDays: config.referralExpiryDays,
      },
      referrerByCode,
      referee,
      referralRecord,
      payoutTxns,
      derivedReason,
    };
  }

  // ── Fraud Prevention ─────────────────────────────────────────────────────────

  private async calculateFraudScore(
    referrerId: string,
    ipAddress?: string,
  ): Promise<number> {
    let score = 0;

    if (ipAddress) {
      // IP velocity: >2 sign-ups with this referrer's code from same IP in 1hr
      const oneHourAgo = new Date(Date.now() - 3600_000);
      const sameIpCount = await this.prisma.referralRecord.count({
        where: {
          referrerId,
          signupIp: ipAddress,
          createdAt: { gte: oneHourAgo },
        },
      });
      if (sameIpCount >= 2) score += 50;
      else if (sameIpCount === 1) score += 20;
    }

    // Referrer has no published properties (new/empty account)
    const referrerPropertyCount = await this.prisma.property.count({
      where: { ownerId: referrerId, status: "PUBLISHED" },
    });
    if (referrerPropertyCount === 0) score += 10;

    return Math.min(score, 100);
  }

  private getActiveCampaignMultiplier(config: any): number {
    const now = new Date();
    if (
      config.campaignStartAt &&
      config.campaignEndAt &&
      now >= new Date(config.campaignStartAt) &&
      now <= new Date(config.campaignEndAt)
    ) {
      return config.campaignBonusMultiplier || 1.0;
    }
    return 1.0;
  }
}
