import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReferralsService } from './referrals.service';

@Injectable()
export class ReferralsScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReferralsScheduler.name);
  private static readonly BACKFILL_BATCH_SIZE = 300;
  private static readonly MAX_BATCH_PASSES = 100;
  private static readonly QUALIFICATION_RECONCILE_BATCH_SIZE = 200;
  private static readonly MIGRATION_BATCH_SIZE = 200;

  constructor(private readonly referralsService: ReferralsService) {}

  async onModuleInit() {
    setTimeout(() => {
      void this.logEffectivePolicySnapshot();
    }, 5_000);
    // Warm start pass for legacy users without referral codes.
    setTimeout(() => {
      void this.runBackfillBatch('startup');
    }, 10_000);
    // Warm start pass to recover missed qualification events.
    setTimeout(() => {
      void this.runQualificationReconcile('startup');
    }, 15_000);
    setTimeout(() => {
      void this.runLegacyMigration('startup');
    }, 20_000);
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleReferralCodeBackfill() {
    await this.runBackfillBatch('cron');
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleQualificationReconcile() {
    await this.runQualificationReconcile('cron');
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleLegacyMigration() {
    await this.runLegacyMigration('cron');
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleStaleReferralExpiry() {
    try {
      const n = await this.referralsService.expireStaleReferrals(500);
      if (n > 0) {
        this.logger.log(`Referral expiry job marked ${n} record(s) EXPIRED`);
      }
    } catch (error: any) {
      this.logger.warn(`Referral expiry job skipped: ${error?.message ?? error}`);
    }
  }

  private async runBackfillBatch(source: 'startup' | 'cron') {
    let totalUpdated = 0;
    for (let pass = 1; pass <= ReferralsScheduler.MAX_BATCH_PASSES; pass++) {
      const updated = await this.referralsService.backfillMissingReferralCodes(
        ReferralsScheduler.BACKFILL_BATCH_SIZE,
      );
      totalUpdated += updated;
      if (updated < ReferralsScheduler.BACKFILL_BATCH_SIZE) break;
    }

    if (totalUpdated > 0) {
      this.logger.log(`Referral code backfill (${source}) updated ${totalUpdated} users`);
    }
  }

  private async runQualificationReconcile(source: 'startup' | 'cron') {
    const reconciled = await this.referralsService.reconcilePendingQualifications(
      ReferralsScheduler.QUALIFICATION_RECONCILE_BATCH_SIZE,
    );
    if (reconciled > 0) {
      this.logger.log(`Referral qualification reconcile (${source}) processed ${reconciled} records`);
    }
  }

  private async runLegacyMigration(source: 'startup' | 'cron') {
    try {
      const { signupAdjusted, referralsReconciled } =
        await this.referralsService.runLegacyCreditsReferralMigration(
          ReferralsScheduler.MIGRATION_BATCH_SIZE,
        );
      if (signupAdjusted > 0 || referralsReconciled > 0) {
        this.logger.log(
          `Legacy migration (${source}) adjusted signup=${signupAdjusted}, referrals=${referralsReconciled}`,
        );
      }
    } catch (error: any) {
      // Keep API alive when migration columns are not yet applied.
      if (error?.code === 'P2022' || error?.code === 'P2010') {
        this.logger.warn(
          `Skipping legacy migration (${source}) due to DB compatibility issue: ${error?.meta?.column ?? error?.meta?.message ?? 'unknown'}`,
        );
        return;
      }
      this.logger.error(`Legacy migration (${source}) failed`, error?.stack ?? String(error));
      return;
    }
  }

  private async logEffectivePolicySnapshot() {
    try {
      const config = await this.referralsService.getConfig();
      this.logger.log(
        `Policy snapshot: signupBonus=${config.signupBonus}, listingCostCredits=${config.listingCostCredits}, newUserGrantDays=${config.newUserGrantDays}, referrerReward=${config.referrerReward}, refereeBonus=${config.refereeBonus}, referralExpiryDays=${config.referralExpiryDays}`,
      );
    } catch (error) {
      this.logger.warn('Could not load policy snapshot at startup');
    }
  }
}
