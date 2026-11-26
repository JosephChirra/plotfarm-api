import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EngagementService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getFavorites(userId: string) {
    const favs = await this.prisma.propertyFavorite.findMany({
      where: { userId },
      include: {
        property: {
          include: {
            owner: { select: { id: true, fullName: true, email: true } },
            category: true,
            location: true,
            media: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    return favs.map((f: { property: unknown }) => f.property);
  }

  async toggleFavorite(userId: string, propertyId: string) {
    const existing = await this.prisma.propertyFavorite.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
    });
    if (existing) {
      await this.prisma.propertyFavorite.delete({
        where: { userId_propertyId: { userId, propertyId } },
      });
      return { favorited: false };
    }
    await this.prisma.propertyFavorite.create({
      data: { userId, propertyId },
    });
    return { favorited: true };
  }

  async toggleInterest(userId: string, propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, title: true, ownerId: true, isBlocked: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (property.isBlocked) {
      throw new BadRequestException('This post is not available');
    }
    if (property.ownerId === userId) {
      throw new BadRequestException('You cannot express interest on your own post');
    }

    const existing = await this.prisma.propertyInterest.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
    });
    if (existing) {
      await this.prisma.propertyInterest.delete({
        where: { userId_propertyId: { userId, propertyId } },
      });
      return { interested: false };
    }

    await this.prisma.propertyInterest.create({
      data: { userId, propertyId },
    });

    const buyer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
    const buyerLabel = buyer?.fullName || buyer?.email || 'Someone';
    if (property.ownerId) {
      await this.notificationsService.sendInterestNotification(
        property.ownerId,
        buyerLabel,
        property.title,
        undefined,
        property.id,
      );
    }

    return { interested: true };
  }

  async getPropertyInterests(propertyId: string, ownerId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (property.ownerId !== ownerId) {
      throw new ForbiddenException('You do not have access to this data');
    }

    const [count, recent] = await Promise.all([
      this.prisma.propertyInterest.count({ where: { propertyId } }),
      this.prisma.propertyInterest.findMany({
        where: { propertyId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
    ]);

    return {
      count,
      recent: recent.map((row) => ({
        userId: row.userId,
        createdAt: row.createdAt,
        user: row.user,
      })),
    };
  }

  async getStatus(userId: string, propertyIds: string[]) {
    if (propertyIds.length === 0) {
      return { favorited: [], interested: [] };
    }
    const favs = await this.prisma.propertyFavorite.findMany({
      where: { userId, propertyId: { in: propertyIds } },
      select: { propertyId: true },
    });

    const interests = await this.prisma.propertyInterest.findMany({
      where: { userId, propertyId: { in: propertyIds } },
      select: { propertyId: true },
    });

    return {
      favorited: favs.map((f) => f.propertyId),
      interested: interests.map((i) => i.propertyId),
    };
  }
}
