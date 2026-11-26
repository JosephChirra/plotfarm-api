import { Injectable } from '@nestjs/common';
import { UserRole, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { PropertiesService } from '../properties/properties.service';

@Injectable()
export class StatsService {
  constructor(
    private prisma: PrismaService,
    private propertiesService: PropertiesService,
  ) { }

  async getDashboardStats() {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalPlots,
      pendingPlots,
      approvedPlots,
      rejectedPlots,
      totalInquiries,
      plotsAddedToday,
      usersRegisteredToday,
      locations,
      landValueResult,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.property.count(),
      this.prisma.property.count({
        where: { verificationStatus: VerificationStatus.PENDING },
      }),
      this.prisma.property.count({
        where: { verificationStatus: VerificationStatus.VERIFIED },
      }),
      this.prisma.property.count({
        where: { verificationStatus: VerificationStatus.REJECTED },
      }),
      this.prisma.propertyLead.count(),
      this.prisma.property.count({
        where: { createdAt: { gte: last24Hours } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: last24Hours } },
      }),
      this.prisma.propertyLocation.findMany({ select: { district: true } }),
      this.prisma.property.aggregate({
        where: {
          verificationStatus: VerificationStatus.VERIFIED,
          isBlocked: false,
          price: { not: null },
        },
        _sum: { price: true },
      }),
    ]);

    const districtsSet = new Set(locations.map((l: any) => l.district).filter(Boolean));
    const districtsCount = districtsSet.size;
    const landTraded = Number(landValueResult._sum.price ?? 0);

    return {
      total_users: totalUsers,
      total_plots: totalPlots,
      pending_plots: pendingPlots,
      approved_plots: approvedPlots,
      rejected_plots: rejectedPlots,
      total_inquiries: totalInquiries,
      plots_added_today: plotsAddedToday,
      users_registered_today: usersRegisteredToday,
      verifiedPosts: approvedPlots,
      districtsCovered: districtsCount,
      happyUsers: totalUsers,
      landTradedCr: Math.round(landTraded / 10_000_000),
    };
  }

  async getTopViewed(limit = 10) {
    const properties = await this.prisma.property.findMany({
      where: {
        verificationStatus: VerificationStatus.VERIFIED,
        status: 'PUBLISHED',
        isBlocked: false,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        price: true,
        location: { select: { state: true, district: true } },
        owner: { select: { id: true, fullName: true } },
      },
    });
    return properties;
  }

  async getTopFavorited(limit = 10) {
    const properties = await this.prisma.property.findMany({
      where: {
        verificationStatus: VerificationStatus.VERIFIED,
        status: 'PUBLISHED',
        isBlocked: false,
      },
      take: limit,
      orderBy: {
        favorites: { _count: 'desc' },
      },
      select: {
        id: true,
        title: true,
        price: true,
        location: { select: { state: true, district: true } },
        owner: { select: { id: true, fullName: true } },
        _count: { select: { favorites: true } },
      },
    });
    return properties;
  }

  /** Single endpoint for the user dashboard — replaces 3–4 separate API calls. */
  async getUserDashboardStats(userId: string, role: UserRole) {
    const mediaInclude = { orderBy: { sortOrder: 'asc' as const } };

    const [
      postsCount,
      recentPosts,
      viewsAgg,
      inquiriesCount,
      newInquiriesCount,
      recentInquiries,
      favoritesCount,
      recentFavorites,
      creditQuota,
    ] = await Promise.all([
      // Total posts owned by this user
      this.prisma.property.count({ where: { ownerId: userId } }),

      // Last 3 posts for preview
      this.prisma.property.findMany({
        where: { ownerId: userId },
        take: 3,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          location: true,
          media: mediaInclude,
        },
      }),

      // Sum of views across all their posts
      this.prisma.property.aggregate({
        where: { ownerId: userId },
        _sum: { views: true },
      }),

      // Total inquiries on their properties
      this.prisma.propertyLead.count({
        where: { property: { ownerId: userId } },
      }),

      // New (unread) inquiries
      this.prisma.propertyLead.count({
        where: { property: { ownerId: userId }, status: 'NEW' },
      }),

      // Last 5 inquiries for preview
      this.prisma.propertyLead.findMany({
        where: { property: { ownerId: userId } },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { id: true, title: true } },
          buyer: { select: { id: true, fullName: true, email: true } },
        },
      }),

      // Total favorites saved by this user
      this.prisma.propertyFavorite.count({ where: { userId } }),

      // Last 4 favorited properties for preview
      this.prisma.propertyFavorite.findMany({
        where: { userId },
        take: 4,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            include: {
              category: true,
              location: true,
              media: mediaInclude,
            },
          },
        },
      }),

      // Same credit-based quota as GET /properties/my-quota (wallet / listing cost).
      this.propertiesService.getMyQuota(userId),
    ]);

    const result: Record<string, unknown> = {
      posts: {
        count: postsCount,
        totalViews: Number(viewsAgg._sum.views ?? 0),
        recent: recentPosts,
      },
      inquiries: {
        count: inquiriesCount,
        newCount: newInquiriesCount,
        recent: recentInquiries,
      },
      favorites: {
        count: favoritesCount,
        recent: recentFavorites.map((f) => f.property),
      },
      quota: {
        balance: creditQuota.balance,
        remaining: creditQuota.remaining,
        canPost: creditQuota.canPost,
        label: creditQuota.label,
        costPerListing: creditQuota.costPerListing,
      },
    };

    // Include admin-level platform stats if caller is an admin
    if (role === UserRole.ADMIN) {
      result.admin = await this.getDashboardStats();
    }

    return result;
  }
}
