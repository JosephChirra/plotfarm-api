import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../core/database/prisma.service";
import {
  CreditTransactionType,
  Prisma,
  WalletTransactionDirection,
} from "@prisma/client";
import {
  ConsumeCreditsDto,
  CreditIssuedDto,
  CreditSpendDto,
} from "./dto/credits.dto";
import { PaginationDto } from "../../shared/dto/pagination.dto";
import { signupCreditKey } from "../../shared/utils/credit-idempotency";

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);
  private extendedCreditColumnsSupport: boolean | null = null;

  constructor(private prisma: PrismaService) {}

  /**
   * Reconciles the cached `User.creditBalance` against the ledger.
   * Source of truth: the most recent CreditTransaction.balanceAfter.
   *
   * This does NOT change user value; it repairs drift so future debits/credits remain correct.
   */
  private async reconcileBalanceCacheFromLedger(
    tx: Prisma.TransactionClient,
    userId: string,
    currentBalance: number,
  ): Promise<number> {
    const last = await tx.creditTransaction.findFirst({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { balanceAfter: true },
    });
    if (!last) return currentBalance;
    const ledgerBalance = Number(last.balanceAfter);
    if (!Number.isFinite(ledgerBalance)) return currentBalance;
    if (ledgerBalance === currentBalance) return currentBalance;

    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: ledgerBalance },
    });
    this.logger.warn(
      `Reconciled User.creditBalance for ${userId}: ${currentBalance} → ${ledgerBalance}`,
    );
    return ledgerBalance;
  }

  private async hasExtendedCreditColumns(): Promise<boolean> {
    if (this.extendedCreditColumnsSupport != null)
      return this.extendedCreditColumnsSupport;
    try {
      await this.prisma.$queryRaw`
        SELECT "idempotencyKey", "source"
        FROM "CreditTransaction"
        LIMIT 0
      `;
      this.extendedCreditColumnsSupport = true;
    } catch {
      this.extendedCreditColumnsSupport = false;
      this.logger.warn(
        "CreditTransaction extended columns not available yet; using legacy wallet write compatibility mode.",
      );
    }
    return this.extendedCreditColumnsSupport;
  }

  private sourceFromType(type: CreditTransactionType): string {
    const t = String(type);
    switch (t) {
      case CreditTransactionType.SIGNUP_BONUS:
        return "SIGNUP";
      case CreditTransactionType.REFERRAL_REWARD:
      case CreditTransactionType.REFEREE_BONUS:
        return "REFERRAL";
      case CreditTransactionType.LISTING_SPEND:
        return "LISTING";
      case CreditTransactionType.LISTING_REFUND:
        return "REFUND";
      case "POST_SPEND":
        return "POST";
      case "POST_REFUND":
        return "REFUND";
      case CreditTransactionType.EXPIRED:
        return "EXPIRY";
      case CreditTransactionType.PURCHASE:
        return "PURCHASE";
      default:
        return "SYSTEM";
    }
  }

  private canonicalizeSource(
    source: string | undefined | null,
    type: CreditTransactionType,
  ): string {
    const normalized = (source ?? "").trim().toUpperCase();
    if (normalized === "SIGNUP") return "SIGNUP";
    if (
      normalized === "REFERRAL" ||
      normalized === "REFERRAL_REWARD" ||
      normalized === "REFEREE_BONUS"
    ) {
      return "REFERRAL";
    }
    if (normalized === "LISTING" || normalized === "LISTING_DEBIT")
      return "LISTING";
    if (normalized === "POST" || normalized === "POST_DEBIT") return "POST";
    if (normalized === "REFUND" || normalized === "LISTING_REFUND")
      return "REFUND";
    if (normalized === "POST_REFUND") return "REFUND";
    if (normalized === "EXPIRY" || normalized === "CREDIT_EXPIRY")
      return "EXPIRY";
    if (normalized === "PURCHASE") return "PURCHASE";
    if (
      normalized === "ADMIN_CREDIT" ||
      normalized === "ADMIN_DEBIT" ||
      normalized === "ADMIN"
    )
      return "ADMIN";
    return this.sourceFromType(type);
  }

  private enumFallbackType(
    type: CreditTransactionType,
  ): CreditTransactionType | null {
    const t = String(type);
    if (t === "POST_SPEND") return CreditTransactionType.LISTING_SPEND;
    if (t === "POST_REFUND") return CreditTransactionType.LISTING_REFUND;
    if (t === "POST_RENEWAL") return CreditTransactionType.LISTING_RENEWAL;
    if (t === "EARNED_POST") return CreditTransactionType.EARNED_LISTING;
    if (t === "SPENT_FEATURE_POST")
      return CreditTransactionType.SPENT_FEATURE_LISTING;
    return null;
  }

  private isMissingEnumValueError(
    err: unknown,
    enumValue: string,
  ): boolean {
    const msg = String((err as any)?.message ?? err ?? "");
    return (
      msg.includes("invalid input value for enum") && msg.includes(`"${enumValue}"`)
    );
  }

  private async lockUserAndReadBalance(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    try {
      const rows = await tx.$queryRaw<Array<{ creditBalance: number }>>`
        SELECT "creditBalance"
        FROM "User"
        WHERE "id" = ${userId}
        FOR UPDATE
      `;
      if (rows.length === 0) throw new NotFoundException("User not found");
      const balance = Number(rows[0].creditBalance);
      return await this.reconcileBalanceCacheFromLedger(tx, userId, balance);
    } catch (e: any) {
      // Some poolers / replicas reject FOR UPDATE; fall back (idempotency still prevents double grants).
      if (e instanceof NotFoundException) throw e;
      this.logger.warn(
        `Row lock unavailable for user ${userId}, using unlocked read: ${e?.message ?? e}`,
      );
      const u = await tx.user.findUnique({
        where: { id: userId },
        select: { creditBalance: true },
      });
      if (!u) throw new NotFoundException("User not found");
      const balance = Number(u.creditBalance);
      return await this.reconcileBalanceCacheFromLedger(tx, userId, balance);
    }
  }

  private async findByIdempotencyKey(
    tx: Prisma.TransactionClient,
    userId: string,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) return null;
    try {
      return await tx.creditTransaction.findFirst({
        where: { userId, idempotencyKey },
      });
    } catch (err: any) {
      // Backward compatibility: older DB may not yet have idempotencyKey column.
      if (err?.code === "P2022") return null;
      throw err;
    }
  }

  private async findByAnyIdempotencyKey(
    tx: Prisma.TransactionClient,
    userId: string,
    keys: Array<string | undefined | null>,
  ) {
    const normalized = keys
      .map((k) => (typeof k === "string" ? k.trim() : ""))
      .filter((k) => k.length > 0);
    if (normalized.length === 0) return null;

    try {
      return await tx.creditTransaction.findFirst({
        where: { userId, idempotencyKey: { in: normalized } },
      });
    } catch (err: any) {
      // Backward compatibility: older DB may not yet have idempotencyKey column.
      if (err?.code === "P2022") return null;
      throw err;
    }
  }

  private expandIdempotencyAliases(key: string): string[] {
    // Dual-acceptance window for the listing→post rename:
    // - New format: post:debit:<propertyId>
    // - Legacy format: listing:debit:<propertyId>
    if (key.startsWith("listing:debit:")) {
      return [`post:debit:${key.slice("listing:debit:".length)}`];
    }
    if (key.startsWith("post:debit:")) {
      return [`listing:debit:${key.slice("post:debit:".length)}`];
    }
    return [];
  }

  /**
   * Idempotent wallet writer. Returns existing transaction when the key already exists.
   */
  private async writeTransactionIdempotent(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      direction: WalletTransactionDirection;
      amount: number;
      type: CreditTransactionType;
      description?: string;
      metadata?: Record<string, any>;
      referralId?: string;
      expiresAt?: Date;
      idempotencyKey?: string;
      idempotencyKeyAliases?: string[];
      source?: string;
    },
  ) {
    let supportsExtendedColumns = await this.hasExtendedCreditColumns();
    if (supportsExtendedColumns) {
      const inferredAliases = params.idempotencyKey
        ? this.expandIdempotencyAliases(params.idempotencyKey)
        : [];
      const existing = await this.findByAnyIdempotencyKey(tx, params.userId, [
        params.idempotencyKey,
        ...(params.idempotencyKeyAliases ?? []),
        ...inferredAliases,
      ]);
      if (existing) {
        this.logger.warn(
          `Idempotency hit: returning existing transaction ${existing.id} for key ${params.idempotencyKey ?? "alias"}`,
        );
        return existing;
      }
    }

    const balanceBefore = await this.lockUserAndReadBalance(tx, params.userId);
    const delta =
      params.direction === WalletTransactionDirection.CREDIT
        ? params.amount
        : -params.amount;
    const balanceAfter = balanceBefore + delta;
    if (balanceAfter < 0) {
      throw new BadRequestException("Insufficient credit balance");
    }

    const createLegacy = async () =>
      tx.creditTransaction.create({
        data: {
          userId: params.userId,
          type: params.type,
          direction: params.direction,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          description: params.description,
          metadata: params.metadata as any,
          referralId: params.referralId,
          expiresAt: params.expiresAt,
        },
      });

    const createExtended = async () =>
      tx.creditTransaction.create({
        data: {
          userId: params.userId,
          type: params.type,
          direction: params.direction,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          description: params.description,
          metadata: params.metadata as any,
          referralId: params.referralId,
          expiresAt: params.expiresAt,
          idempotencyKey: params.idempotencyKey,
          source: this.canonicalizeSource(params.source, params.type),
        },
      });

    try {
      // Ledger write and balance update happen in one DB transaction scope.
      let txn: any;
      if (supportsExtendedColumns) {
        txn = await createExtended();
      } else {
        txn = await createLegacy();
      }

      await tx.user.update({
        where: { id: params.userId },
        data: { creditBalance: balanceAfter },
      });

      return txn;
    } catch (err: any) {
      // Backward compatibility: if DB enum hasn't been migrated yet, retry using legacy type.
      const fallbackType = this.enumFallbackType(params.type);
      if (fallbackType && this.isMissingEnumValueError(err, String(params.type))) {
        this.logger.warn(
          `CreditTransactionType ${String(params.type)} not supported by DB yet; falling back to ${String(fallbackType)} (user=${params.userId}).`,
        );
        const retryParams = { ...params, type: fallbackType };
        const retryLegacy = async () =>
          tx.creditTransaction.create({
            data: {
              userId: retryParams.userId,
              type: retryParams.type,
              direction: retryParams.direction,
              amount: retryParams.amount,
              balanceBefore,
              balanceAfter,
              description: retryParams.description,
              metadata: retryParams.metadata as any,
              referralId: retryParams.referralId,
              expiresAt: retryParams.expiresAt,
            },
          });
        const retryExtended = async () =>
          tx.creditTransaction.create({
            data: {
              userId: retryParams.userId,
              type: retryParams.type,
              direction: retryParams.direction,
              amount: retryParams.amount,
              balanceBefore,
              balanceAfter,
              description: retryParams.description,
              metadata: retryParams.metadata as any,
              referralId: retryParams.referralId,
              expiresAt: retryParams.expiresAt,
              idempotencyKey: retryParams.idempotencyKey,
              source: this.canonicalizeSource(retryParams.source, retryParams.type),
            },
          });

        let txn: any;
        if (supportsExtendedColumns) txn = await retryExtended();
        else txn = await retryLegacy();
        await tx.user.update({
          where: { id: retryParams.userId },
          data: { creditBalance: balanceAfter },
        });
        return txn;
      }

      // Backward compatibility: if DB is missing newly-added columns, fall back to legacy insert.
      if (
        supportsExtendedColumns &&
        err?.code === "P2022" &&
        (String(err?.meta?.column ?? "").includes(
          "CreditTransaction.idempotencyKey",
        ) ||
          String(err?.meta?.column ?? "").includes("CreditTransaction.source"))
      ) {
        this.logger.warn(
          `Extended wallet columns missing at runtime; falling back to legacy wallet writes (user=${params.userId}).`,
        );
        this.extendedCreditColumnsSupport = false;
        supportsExtendedColumns = false;
        const txn = await createLegacy();
        await tx.user.update({
          where: { id: params.userId },
          data: { creditBalance: balanceAfter },
        });
        return txn;
      }
      // Concurrent writer inserted same key first. Return existing row.
      if (
        supportsExtendedColumns &&
        params.idempotencyKey &&
        err?.code === "P2002"
      ) {
        const inferredAliases = params.idempotencyKey
          ? this.expandIdempotencyAliases(params.idempotencyKey)
          : [];
        const duplicate = await this.findByAnyIdempotencyKey(
          tx,
          params.userId,
          [
            params.idempotencyKey,
            ...(params.idempotencyKeyAliases ?? []),
            ...inferredAliases,
          ],
        );
        if (duplicate) {
          this.logger.warn(
            `Idempotency race recovered: using transaction ${duplicate.id} for key ${params.idempotencyKey}`,
          );
          return duplicate;
        }
      }
      throw err;
    }
  }

  private async getBalanceBreakdown(
    userId: string,
    currentBalance: number,
  ): Promise<{ free: number; earned: number; purchased: number }> {
    const txns = await this.prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        type: true,
        direction: true,
        amount: true,
      },
    });
    let free = 0;
    let earned = 0;
    let purchased = 0;

    for (const txn of txns) {
      if (txn.direction === WalletTransactionDirection.CREDIT) {
        if (txn.type === CreditTransactionType.SIGNUP_BONUS) free += txn.amount;
        else if (txn.type === CreditTransactionType.PURCHASE)
          purchased += txn.amount;
        else earned += txn.amount;
        continue;
      }

      if (txn.type === CreditTransactionType.EXPIRED) {
        const dec = Math.min(free, txn.amount);
        free -= dec;
        continue;
      }

      // Consume from FREE first to reduce expiry loss, then EARNED, then PURCHASED.
      let remaining = txn.amount;
      const fromFree = Math.min(free, remaining);
      free -= fromFree;
      remaining -= fromFree;
      const fromEarned = Math.min(earned, remaining);
      earned -= fromEarned;
      remaining -= fromEarned;
      const fromPurchased = Math.min(purchased, remaining);
      purchased -= fromPurchased;
      remaining -= fromPurchased;
      if (remaining > 0) {
        // Historical mismatch tolerance in legacy data.
        this.logger.warn(
          `Balance bucket replay underflow for user ${userId} by ${remaining}`,
        );
      }
    }

    free = Math.max(free, 0);
    earned = Math.max(earned, 0);
    purchased = Math.max(purchased, 0);

    const computedTotal = free + earned + purchased;
    if (computedTotal !== currentBalance) {
      const delta = currentBalance - computedTotal;
      if (delta > 0) {
        earned += delta;
      } else {
        let toRemove = Math.abs(delta);
        const fromPurchased = Math.min(purchased, toRemove);
        purchased -= fromPurchased;
        toRemove -= fromPurchased;
        const fromEarned = Math.min(earned, toRemove);
        earned -= fromEarned;
        toRemove -= fromEarned;
        const fromFree = Math.min(free, toRemove);
        free -= fromFree;
      }
      this.logger.warn(
        `Credit breakdown reconciled for user ${userId}: adjusted buckets to match balance ${currentBalance}`,
      );
    }

    return { free, earned, purchased };
  }

  /**
   * Idempotent: grants welcome FREE credits if the user has no SIGNUP_BONUS yet and is still
   * inside the new-user grant window. Safe to call on every balance read (fast exit when done).
   */
  async ensureWelcomeSignupCredits(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true },
    });
    if (!user) return false;

    const hasSignup = await this.prisma.creditTransaction.findFirst({
      where: { userId, type: CreditTransactionType.SIGNUP_BONUS },
      select: { id: true },
    });
    if (hasSignup) return false;

    let config = await this.prisma.creditConfig.findFirst();
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
          listingCostCredits: 1,
          listingVisibilityDays: 30,
          newUserGrantListings: 5,
          newUserGrantDays: 30,
          campaignBonusMultiplier: 1.0,
          fraudAutoHoldScore: 70,
          enableCreditExpiry: true,
        },
      });
    }

    const listingCost = Math.max(1, config.listingCostCredits ?? 1);
    const grantListings = Math.max(1, config.newUserGrantListings ?? 5);
    const grantDays = Math.max(1, config.newUserGrantDays ?? 30);
    const amount = grantListings * listingCost;
    if (amount <= 0) return false;

    const createdMs =
      user.createdAt instanceof Date && !Number.isNaN(user.createdAt.getTime())
        ? user.createdAt.getTime()
        : Date.now();
    const windowEnd = createdMs + grantDays * 24 * 60 * 60 * 1000;
    if (Date.now() > windowEnd) return false;

    const expiresAt = new Date(createdMs + grantDays * 24 * 60 * 60 * 1000);
    const dto: CreditIssuedDto = {
      amount,
      type: CreditTransactionType.SIGNUP_BONUS,
      description: `Welcome to PlotFarm! ${grantListings} free post credits added (valid ${grantDays} days).`,
      expiresAt,
      metadata: {
        grantListings,
        listingCostCredits: listingCost,
        ensureWelcome: true,
      },
      idempotencyKey: signupCreditKey(userId),
      source: "SIGNUP",
    };

    try {
      await this.creditTokens(userId, dto);
      this.logger.log(
        `Welcome credits ensured for user ${userId} (+${amount})`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `ensureWelcomeSignupCredits attempt 1 failed for ${userId}`,
        err,
      );
      try {
        await this.creditTokens(userId, dto);
        return true;
      } catch (err2) {
        this.logger.error(
          `ensureWelcomeSignupCredits retry failed for ${userId}`,
          err2,
        );
        return false;
      }
    }
  }

  async getBalance(
    userId: string,
  ): Promise<{
    balance: number;
    breakdown: { free: number; earned: number; purchased: number };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true },
    });
    if (!user) throw new NotFoundException("User not found");
    const breakdown = await this.getBalanceBreakdown(
      userId,
      user.creditBalance,
    );
    return { balance: user.creditBalance, breakdown };
  }

  /**
   * Credits tokens to a user's wallet atomically.
   * Uses a Prisma transaction to ensure the balance update and the
   * TokenTransaction record are always in sync (no split-brain).
   */
  async creditTokens(
    userId: string,
    dto: CreditIssuedDto,
    options?: { tx?: Prisma.TransactionClient },
  ) {
    const execute = async (tx: Prisma.TransactionClient) => {
      const txn = await this.writeTransactionIdempotent(tx, {
        userId,
        direction: WalletTransactionDirection.CREDIT,
        amount: dto.amount,
        type: dto.type,
        description: dto.description,
        metadata: dto.metadata,
        referralId: dto.referralId,
        expiresAt: dto.expiresAt,
        idempotencyKey: dto.idempotencyKey,
        idempotencyKeyAliases: dto.idempotencyKeyAliases,
        source: dto.source,
      });
      this.logger.log(
        `Credited ${dto.amount} credits to user ${userId} [${dto.type}] key=${dto.idempotencyKey ?? "none"}`,
      );
      return txn;
    };

    if (options?.tx) return execute(options.tx);
    return this.prisma.$transaction(execute);
  }

  /**
   * Debits tokens from a user's wallet atomically.
   * Throws BadRequestException if the user has insufficient balance.
   */
  async debitTokens(
    userId: string,
    dto: CreditSpendDto,
    options?: { tx?: Prisma.TransactionClient },
  ) {
    const execute = async (tx: Prisma.TransactionClient) => {
      const txn = await this.writeTransactionIdempotent(tx, {
        userId,
        direction: WalletTransactionDirection.DEBIT,
        amount: dto.amount,
        type: dto.type,
        description: dto.description,
        metadata: dto.metadata,
        idempotencyKey: dto.idempotencyKey,
        idempotencyKeyAliases: dto.idempotencyKeyAliases,
        source: dto.source,
      });
      this.logger.log(
        `Debited ${dto.amount} credits from user ${userId} [${dto.type}] key=${dto.idempotencyKey ?? "none"}`,
      );
      return txn;
    };
    if (options?.tx) return execute(options.tx);
    return this.prisma.$transaction(execute);
  }

  async hasEnoughTokens(userId: string, amount: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true },
    });
    return (user?.creditBalance ?? 0) >= amount;
  }

  async getTransactionHistory(userId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    let items: any[] = [];
    let total = 0;
    try {
      [items, total] = await Promise.all([
        this.prisma.creditTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.creditTransaction.count({ where: { userId } }),
      ]);
    } catch (err: any) {
      // Backward-compatible fallback when DB migration for newly-added columns isn't applied yet.
      if (err?.code !== "P2022") throw err;
      this.logger.warn(
        `Falling back to legacy CreditTransaction select due to missing column: ${err?.meta?.column ?? "unknown"}`,
      );
      [items, total] = await Promise.all([
        this.prisma.creditTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            userId: true,
            type: true,
            direction: true,
            amount: true,
            balanceBefore: true,
            balanceAfter: true,
            description: true,
            metadata: true,
            expiresAt: true,
            referralId: true,
            createdAt: true,
          },
        }),
        this.prisma.creditTransaction.count({ where: { userId } }),
      ]);
    }

    return {
      items: items.map((item: any) => ({
        ...item,
        source: this.canonicalizeSource(item.source, item.type),
      })),
      pagination: {
        total,
        page,
        size: limit,
        pages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async consumeCredits(userId: string, dto: ConsumeCreditsDto) {
    const key =
      dto.idempotencyKey?.trim() ||
      `consume:${userId}:${dto.amount}:${Date.now()}`;
    const txn = await this.debitTokens(userId, {
      amount: dto.amount,
      type: "POST_SPEND" as CreditTransactionType,
      description: "Credits consumed",
      metadata: dto.metadata,
      idempotencyKey: key,
      source: "POST",
    });
    return {
      success: true,
      transactionId: txn.id,
      balanceAfter: txn.balanceAfter,
    };
  }

  /** Admin: manually credit any user (e.g., compensation, promotion) */
  async adminCredit(
    adminId: string,
    userId: string,
    amount: number,
    reason?: string,
  ) {
    return this.creditTokens(userId, {
      amount,
      type: CreditTransactionType.ADMIN_CREDIT,
      description: reason ?? `Manual credit by admin ${adminId}`,
      metadata: { adminId },
      idempotencyKey: `admin-credit:${adminId}:${userId}:${amount}:${reason ?? "none"}`,
      source: "ADMIN_CREDIT",
    });
  }

  /** Admin: manually debit any user (e.g., clawback after fraud) */
  async adminDebit(
    adminId: string,
    userId: string,
    amount: number,
    reason?: string,
  ) {
    return this.debitTokens(userId, {
      amount,
      type: CreditTransactionType.ADMIN_DEBIT,
      description: reason ?? `Manual debit by admin ${adminId}`,
      metadata: { adminId },
      idempotencyKey: `admin-debit:${adminId}:${userId}:${amount}:${reason ?? "none"}`,
      source: "ADMIN_DEBIT",
    });
  }

  /** Summary stats for wallet overview */
  async getWalletSummary(userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [balance, earned, spent, lifetimeEarned] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { creditBalance: true },
      }),
      this.prisma.creditTransaction.aggregate({
        where: {
          userId,
          direction: WalletTransactionDirection.CREDIT,
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.creditTransaction.aggregate({
        where: {
          userId,
          direction: WalletTransactionDirection.DEBIT,
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.creditTransaction.aggregate({
        where: { userId, direction: WalletTransactionDirection.CREDIT },
        _sum: { amount: true },
      }),
    ]);

    return {
      balance: balance?.creditBalance ?? 0,
      earnedThisMonth: earned._sum.amount ?? 0,
      spentThisMonth: spent._sum.amount ?? 0,
      lifetimeEarned: lifetimeEarned._sum.amount ?? 0,
    };
  }

  /**
   * Daily job: expire FREE (SIGNUP_BONUS) credits only. EARNED / PURCHASED never expire here.
   * All balance changes go through debitTokens (ledger + idempotency).
   */
  async processExpiredCredits() {
    this.logger.log("Starting expired credits processing...");

    const expiredGrants = await this.prisma.creditTransaction.findMany({
      where: {
        expiresAt: { lte: new Date() },
        type: CreditTransactionType.SIGNUP_BONUS,
        direction: WalletTransactionDirection.CREDIT,
      },
    });

    const unprocessed = expiredGrants.filter((g) => {
      const meta = (g.metadata as any) || {};
      return !meta.expiredAt;
    });

    if (unprocessed.length === 0) {
      this.logger.log("No expired FREE credits to process.");
      return;
    }

    this.logger.log(
      `Processing ${unprocessed.length} expired FREE credit grant(s).`,
    );

    for (const grant of unprocessed) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const idempotencyKey = `expiry:grant:${grant.id}`;
          const existingExpiry = await this.findByIdempotencyKey(
            tx,
            grant.userId,
            idempotencyKey,
          );
          if (existingExpiry) {
            const updatedMeta = {
              ...((grant.metadata as any) || {}),
              expiredAt: new Date(),
            };
            await tx.creditTransaction.update({
              where: { id: grant.id },
              data: { metadata: updatedMeta },
            });
            return;
          }

          const user = await tx.user.findUnique({
            where: { id: grant.userId },
            select: { id: true, creditBalance: true },
          });
          if (!user) return;

          const amountToDeduct = Math.min(user.creditBalance, grant.amount);
          if (amountToDeduct > 0) {
            await this.debitTokens(
              grant.userId,
              {
                amount: amountToDeduct,
                type: CreditTransactionType.EXPIRED,
                description: `FREE credit expiry — original grant ${grant.id.slice(0, 8)}…`,
                metadata: {
                  originalGrantId: grant.id,
                  grantType: "SIGNUP_BONUS",
                },
                idempotencyKey,
                source: "EXPIRY",
              },
              { tx },
            );
          }

          const updatedMeta = {
            ...((grant.metadata as any) || {}),
            expiredAt: new Date(),
          };
          await tx.creditTransaction.update({
            where: { id: grant.id },
            data: { metadata: updatedMeta },
          });
        });

        this.logger.log(
          `Processed expiry for grant ${grant.id} (User: ${grant.userId})`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to process expiry for grant ${grant.id}: ${error?.message ?? error}`,
        );
      }
    }

    this.logger.log("Expired credits processing complete.");
  }
}
