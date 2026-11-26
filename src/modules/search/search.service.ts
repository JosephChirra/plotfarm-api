import { Injectable } from '@nestjs/common';
import { MediaType, Prisma, PropertyStatus, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  landTypeMatchWhere,
  resolvePropertyTypeForCategoryId,
} from '../../shared/land-type-query';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(query: SearchQueryDto, viewerId?: string) {
    const {
      q,
      minPrice,
      maxPrice,
      minArea,
      maxArea,
      state,
      district,
      categoryId,
      landTypeId,
      ownerId,
      postType,
      ownershipType,
      mandal,
      village,
      waterAvailable,
      electricityAvailable,
      roadAccess,
      gatedCommunity,
      isFeatured,
      postedWithinDays,
      facing,
      lat,
      lng,
      radius,
      sort: rawSort = 'newest',
      page: rawPage = 1,
      limit: rawLimit = 10,
    } = query;

    const page = Math.max(rawPage, 1);
    const limit = Math.min(Math.max(rawLimit, 1), 100);

    const allowedSorts = ['newest', 'oldest', 'price_asc', 'price_desc', 'price_low', 'price_high', 'area_low', 'area_high', 'nearby'] as const;
    const sort = allowedSorts.includes(rawSort as (typeof allowedSorts)[number])
      ? rawSort
      : 'newest';

    const where: Prisma.PropertyWhereInput = {
      status: PropertyStatus.PUBLISHED,
      verificationStatus: VerificationStatus.VERIFIED,
      isBlocked: false,
    };

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (postType) {
      where.postType = postType as any;
    }

    if (ownershipType) {
      where.ownershipType = ownershipType as any;
    }

    if (waterAvailable !== undefined) {
      where.waterAvailability = waterAvailable;
    }

    if (electricityAvailable !== undefined) {
      where.electricityAvailable = electricityAvailable;
    }

    if (roadAccess !== undefined) {
      where.roadAccess = roadAccess;
    }

    if (gatedCommunity !== undefined) {
      where.gatedCommunity = gatedCommunity;
    }

    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }

    if (facing && facing.length > 0) {
      where.OR = [
        { facing: { in: facing as any } },
        { facings: { some: { direction: { in: facing as any } } } }
      ];
    }

    if (postedWithinDays !== undefined) {
      const date = new Date();
      date.setDate(date.getDate() - postedWithinDays);
      where.createdAt = { gte: date };
    }

    if (viewerId) {
      where.owner = {
        blocksInitiated: {
          none: { blockedId: viewerId },
        },
        blocksReceived: {
          none: { blockerId: viewerId },
        },
      };
    }

    const textAndLandType: Prisma.PropertyWhereInput[] = [];
    if (q) {
      textAndLandType.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { village: { contains: q, mode: 'insensitive' } },
          { mandal: { contains: q, mode: 'insensitive' } },
          { district: { contains: q, mode: 'insensitive' } },
          { state: { contains: q, mode: 'insensitive' } },
          {
            location: {
              OR: [
                { village: { contains: q, mode: 'insensitive' } },
                { mandal: { contains: q, mode: 'insensitive' } },
                { district: { contains: q, mode: 'insensitive' } },
                { state: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        ],
      });
    }

    const targetCategoryId = landTypeId || categoryId;
    if (targetCategoryId !== undefined) {
      const propertyType = await resolvePropertyTypeForCategoryId(
        this.prisma,
        targetCategoryId,
      );
      if (propertyType) {
        textAndLandType.push(landTypeMatchWhere(targetCategoryId, propertyType));
      } else {
        where.categoryId = targetCategoryId;
      }
    }

    if (textAndLandType.length > 0) {
      if (where.OR) {
        // If we already have an OR (from facing), wrap it in AND
        where.AND = [
          { OR: where.OR },
          ...textAndLandType
        ];
        delete where.OR;
      } else {
        where.AND = textAndLandType;
      }
    }

    const priceFilter: Prisma.DecimalNullableFilter = {};
    if (minPrice !== undefined) {
      priceFilter.gte = minPrice;
    }
    if (maxPrice !== undefined) {
      priceFilter.lte = maxPrice;
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = priceFilter;
    }

    const areaFilter: Prisma.DecimalFilter = {};
    if (minArea !== undefined) {
      areaFilter.gte = minArea;
    }
    if (maxArea !== undefined) {
      areaFilter.lte = maxArea;
    }
    if (minArea !== undefined || maxArea !== undefined) {
      where.landAreaSqFt = areaFilter;
    }

    if (state || district || mandal || village) {
      const locationFilter: Prisma.PropertyLocationWhereInput = {};
      if (state) locationFilter.state = state;
      if (district) locationFilter.district = district;
      if (mandal) locationFilter.mandal = mandal;
      if (village) locationFilter.village = village;

      where.location = {
        is: locationFilter,
      };
    }

    let orderBy: Prisma.PropertyOrderByWithRelationInput | Prisma.PropertyOrderByWithRelationInput[];
    if (sort === 'price_asc' || sort === 'price_low') {
      orderBy = { price: 'asc' };
    } else if (sort === 'price_desc' || sort === 'price_high') {
      orderBy = { price: 'desc' };
    } else if (sort === 'area_low') {
      orderBy = { landAreaSqFt: 'asc' };
    } else if (sort === 'area_high') {
      orderBy = { landAreaSqFt: 'desc' };
    } else if (sort === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else {
      orderBy = { createdAt: 'desc' };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          owner: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              createdAt: true,
              profile: {
                select: { bio: true, profileImageUrl: true }
              }
            }
          },
          location: true,
          media: {
            where: { mediaType: MediaType.IMAGE },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }
}
