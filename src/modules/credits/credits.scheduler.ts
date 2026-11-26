import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreditsService } from './credits.service';

@Injectable()
export class CreditsScheduler {
  private readonly logger = new Logger(CreditsScheduler.name);

  constructor(
    private readonly creditsService: CreditsService,
  ) {}

  /**
   * Daily job to process expired credit grants.
   * Runs daily at 1 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleCreditExpiry() {
    this.logger.log('Checking for expired credit grants...');
    await this.creditsService.processExpiredCredits();
  }
}
