import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PropertyStatus } from '@prisma/client';

@Injectable()
export class PropertiesScheduler {
  private readonly logger = new Logger(PropertiesScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly referralsService: ReferralsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Nightly job to expire posts that have reached their expiresAt date.
   * Runs daily at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireListings() {
    this.logger.log('Starting property expiry check...');

    const expiredProperties = await this.prisma.property.findMany({
      where: {
        status: PropertyStatus.PUBLISHED,
        expiresAt: {
          lte: new Date(),
        },
      },
      select: {
        id: true,
        title: true,
        ownerId: true,
      },
    });

    if (expiredProperties.length === 0) {
      this.logger.log('No properties found for expiry.');
      return;
    }

    this.logger.log(`Found ${expiredProperties.length} properties to expire.`);

    for (const property of expiredProperties) {
      try {
        await this.prisma.property.update({
          where: { id: property.id },
          data: { status: PropertyStatus.INACTIVE },
        });

        if (property.ownerId) {
          this.eventEmitter.emit('notification.send', {
            userId: property.ownerId,
            type: 'LISTING_EXPIRED',
            title: 'Post Expired',
            message: `Your post "${property.title}" has expired and is no longer visible. You can renew it using Credits.`,
            level: 'warning',
            actionUrl: '/my-posts',
          });
        }

        this.logger.log(`Expired property: ${property.id} (${property.title})`);
      } catch (error) {
        this.logger.error(`Failed to expire property ${property.id}: ${error.message}`);
      }
    }

    this.logger.log('Property expiry check complete.');
  }
}
