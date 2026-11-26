import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    dotenv.config({ path: '.env' });
    super();
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint =
        'Check DATABASE_URL and DB firewall (port 5432). Run: npm run db:ping';

      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`${hint} — ${msg}`);
        throw err;
      }

      this.logger.warn(`API starting without DB (dev only). ${hint}. ${msg}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
