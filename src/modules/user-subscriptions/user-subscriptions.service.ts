import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateUserSubscriptionDto } from './dto/create-user-subscription.dto';
import { UpdateUserSubscriptionDto } from './dto/update-user-subscription.dto';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class UserSubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserSubscriptionDto) {
    return this.prisma.userSubscription.create({
      data: dto as never,
      include: { user: true, plan: true },
    });
  }

  async findAll(userId?: string, status?: SubscriptionStatus) {
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    return this.prisma.userSubscription.findMany({
      where,
      include: { user: true, plan: true },
    });
  }

  async findOne(id: string) {
    const sub = await this.prisma.userSubscription.findUnique({
      where: { id },
      include: { user: true, plan: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  async update(id: string, dto: UpdateUserSubscriptionDto) {
    await this.findOne(id);
    return this.prisma.userSubscription.update({
      where: { id },
      data: dto as never,
      include: { user: true, plan: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.userSubscription.delete({ where: { id } });
  }
}
