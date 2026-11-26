import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../core/database/prisma.service";
import { CreatePropertyDto } from "./dto/create-property.dto";
import { UpdatePropertyDto } from "./dto/update-property.dto";
import {
  PaginationDto,
  PaginatedResult,
} from "../../shared/dto/pagination.dto";
import {
  PostType,
  PropertyStatus,
  UserRole,
  VerificationStatus,
  UserStatus,
  CreditTransactionType,
} from "@prisma/client";
import { UploadsService } from "../uploads/uploads.service";
import {
  MAX_PROPERTY_IMAGES,
  MAX_PROPERTY_VIDEOS,
} from "../uploads/upload.constants";
import type { Express } from "express";
import {
  landTypeMatchWhere,
  resolvePropertyTypeForCategoryId,
} from "../../shared/land-type-query";
import { toSqFt } from "./utils/land-conversion.util";
import { NotificationsService } from "../notifications/notifications.service";
import { CreditsService } from "../credits/credits.service";

import { ReferralsService } from "../referrals/referrals.service";
import {
  listingDebitKey,
  postDebitKey,
} from "../../shared/utils/credit-idempotency";

const mediaIncludeOrdered = { orderBy: { sortOrder: "asc" as const } };

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
    private notificationsService: NotificationsService,
    private creditsService: CreditsService,
    private referralsService: ReferralsService,
  ) {}

  /** Returns start/end of current calendar month in UTC */
  private currentMonthRange(): { gte: Date; lt: Date } {
    const now = new Date();
    const gte = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { gte, lt };
  }

  /** Returns { balance, remaining, canPost } for a user based on their Credits */
  async getMyQuota(userId: string) {
    if (!userId || typeof userId !== "string") {
      throw new BadRequestException("Missing authenticated user");
    }

    const config = await this.referralsService.getConfig();
    const listingCostCredits = Math.max(1, config.listingCostCredits ?? 1);

    let safeBalance: number;
    try {
      const { balance } = await this.creditsService.getBalance(userId);
      safeBalance = Number.isFinite(balance) ? balance : 0;
    } catch (err) {
      this.logger.error(
        `getBalance failed in getMyQuota for user ${userId}; falling back to User.creditBalance`,
        err instanceof Error ? err.stack : err,
      );
      const row = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { creditBalance: true },
      });
      safeBalance =
        row != null && Number.isFinite(row.creditBalance)
          ? row.creditBalance
          : 0;
    }

    const remaining = Math.max(0, Math.floor(safeBalance / listingCostCredits));

    return {
      balance: safeBalance,
      remaining,
      canPost: safeBalance >= listingCostCredits,
      costPerPost: listingCostCredits,
      costPerListing: listingCostCredits,
      label: "Credits",
    };
  }

  async create(
    ownerId: string,
    dto: CreatePropertyDto,
    files?: Express.Multer.File[],
  ) {
    const propertyId = randomUUID();

    const {
      state,
      district,
      mandal,
      village,
      area,
      pincode,
      placeId,
      formattedAddress,
      latitude,
      longitude,
      landTypeId,
      categoryId,
      ...propertyDto
    } = dto;

    const uploadedMedia = await this.uploadsService.uploadPropertyMedia(
      files ?? [],
    );

    const resolvedCategoryId = landTypeId ?? categoryId;
    const landAreaSqFt = toSqFt(
      Number(dto.landArea) || 0,
      dto.landUnit ?? "sq_ft",
      dto.guntas,
    );
    const normalizedDto = {
      ...propertyDto,
      ...(resolvedCategoryId != null ? { categoryId: resolvedCategoryId } : {}),
      landAreaSqFt,
    } as Record<string, unknown> &
      typeof propertyDto & { landAreaSqFt: number; categoryId?: number };
    if (dto.propertyType === "FARM_LAND") {
      normalizedDto.gatedCommunity = undefined;
      normalizedDto.projectName = undefined;
    }
    if (dto.propertyType === "PLOT") {
      normalizedDto.soilType = undefined;
      normalizedDto.waterAvailability = undefined;
      normalizedDto.irrigationType = undefined;
      normalizedDto.cropHistory = undefined;
    }

    const uploadedImages = uploadedMedia.filter(
      (item) => item.type === "IMAGE",
    );
    const uploadedVideos = uploadedMedia.filter(
      (item) => item.type === "VIDEO",
    );
    // [PDF_FUTURE] const uploadedDocuments = uploadedMedia.filter((item) => item.type === 'DOCUMENT');

    // DTO images/videos (passed as URLs, no thumbnail available)
    const dtoImageItems = (dto.images ?? []).map((url) => ({
      mediaUrl: url,
      thumbnailUrl: null as string | null,
      mediaType: "IMAGE" as const,
    }));
    const dtoVideoItems = (dto.videos ?? []).map((url) => ({
      mediaUrl: url,
      thumbnailUrl: null as string | null,
      mediaType: "VIDEO" as const,
    }));
    // [PDF_FUTURE] const dtoDocumentItems = (dto.documents ?? []).map((url) => ({
    //   mediaUrl: url, thumbnailUrl: null as string | null, mediaType: 'DOCUMENT' as const,
    // }));

    // Uploaded files (have thumbnails from processing)
    const uploadedImageItems = uploadedImages.map((item) => ({
      mediaUrl: item.url,
      thumbnailUrl: item.thumbnailUrl,
      mediaType: "IMAGE" as const,
    }));
    const uploadedVideoItems = uploadedVideos.map((item) => ({
      mediaUrl: item.url,
      thumbnailUrl: item.thumbnailUrl,
      mediaType: "VIDEO" as const,
    }));
    // [PDF_FUTURE] const uploadedDocumentItems = uploadedDocuments.map((item) => ({
    //   mediaUrl: item.url, thumbnailUrl: item.thumbnailUrl, mediaType: 'DOCUMENT' as const,
    // }));

    // For legacy images array field on Property (URLs only)
    const allImages = [...dtoImageItems, ...uploadedImageItems].map(
      (i) => i.mediaUrl,
    );

    const mediaItems = [
      ...dtoImageItems,
      ...uploadedImageItems,
      ...dtoVideoItems,
      ...uploadedVideoItems,
      // ...dtoDocumentItems,      // [PDF_FUTURE]
      // ...uploadedDocumentItems, // [PDF_FUTURE]
    ];

    let primarySet = false;
    const mediaPayload = mediaItems.map((item, sortOrder) => {
      const row: {
        mediaUrl: string;
        thumbnailUrl: string | null;
        mediaType: "IMAGE" | "VIDEO" | "DOCUMENT"; // [PDF_FUTURE] DOCUMENT included
        sortOrder: number;
        isPrimary: boolean;
      } = {
        mediaUrl: item.mediaUrl,
        thumbnailUrl: item.thumbnailUrl ?? null,
        mediaType: item.mediaType,
        sortOrder,
        isPrimary: false,
      };
      if (!primarySet && item.mediaType === "IMAGE") {
        primarySet = true;
        row.isPrimary = true;
      }
      return row;
    });

    if (!primarySet && mediaPayload.length) {
      mediaPayload[0].isPrimary = true;
    }

    const existingPropertyCount = await this.prisma.property.count({
      where: { ownerId, isDeleted: false },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      return tx.property.create({
        data: {
          id: propertyId,
          ...normalizedDto,
          images: allImages as never,
          ownerId,
          status: PropertyStatus.DRAFT,
          verificationStatus: VerificationStatus.PENDING,
          location: {
            create: {
              state,
              district,
              mandal,
              village: village || null,
              area: area || null,
              pincode: pincode || null,
              place_id: placeId || null,
              formatted_address: formattedAddress || null,
              latitude: latitude ?? null,
              longitude: longitude ?? null,
            },
          },
          media: mediaPayload.length
            ? {
                create: mediaPayload,
              }
            : undefined,
          facings: dto.facings?.length
            ? {
                create: dto.facings.map((f) => ({
                  direction: f.direction,
                  roadWidth: f.roadWidth ?? null,
                })),
              }
            : undefined,
        } as never,
        include: {
          owner: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
          category: true,
          location: true,
          media: mediaIncludeOrdered,
          facings: true,
        },
      });
    });

    return created;
  }

  async findAll(
    pagination: PaginationDto,
    filters?: {
      categoryId?: number;
      status?: PropertyStatus;
      verificationStatus?: VerificationStatus;
      postType?: string;
      ownershipType?: string;
      state?: string;
      maxPrice?: number;
      maxArea?: number;
      ownerId?: string;
      facingDirections?: string[];
      minRoadWidth?: number;
      maxRoadWidth?: number;
      includeDeleted?: boolean;
      onlyDeleted?: boolean;
      onlyBlocked?: boolean;
      /** When true, hide blocked posts (public browse). Owners/admins use false. */
      excludeBlocked?: boolean;
      /** Logged in user ID for hiding data from blocked users. */
      viewerId?: string;
      isAdmin?: boolean;
    },
  ) {
    const { page = 1, limit = 20 } = pagination;
    const where: Prisma.PropertyWhereInput = {
      isDeleted: filters?.onlyDeleted
        ? true
        : filters?.includeDeleted
          ? undefined
          : false,
    };
    if (filters?.onlyBlocked) where.isBlocked = true;
    if (filters?.excludeBlocked) {
      where.isBlocked = false;
      where.status = PropertyStatus.PUBLISHED;
      where.owner = {
        status: { not: UserStatus.BLOCKED },
        isSuspended: false,
      };
    }

    if (filters?.ownerId) where.ownerId = filters.ownerId;
    if (filters?.status) where.status = filters.status;
    if (filters?.verificationStatus)
      where.verificationStatus = filters.verificationStatus;
    if (filters?.postType) where.postType = filters.postType as PostType;
    if (filters?.ownershipType)
      where.ownershipType = filters.ownershipType as never;
    if (filters?.maxPrice != null) where.price = { lte: filters.maxPrice };
    if (filters?.maxArea != null) where.landArea = { lte: filters.maxArea };
    if (filters?.state) where.location = { is: { state: filters.state } };
    if (filters?.facingDirections?.length) {
      (where as Record<string, unknown>).facings = {
        some: { direction: { in: filters.facingDirections } },
      };
    }
    if (filters?.minRoadWidth != null || filters?.maxRoadWidth != null) {
      const widthFilter: Record<string, unknown> = {};
      if (filters.minRoadWidth != null) widthFilter.gte = filters.minRoadWidth;
      if (filters.maxRoadWidth != null) widthFilter.lte = filters.maxRoadWidth;
      const existingFacingsFilter = (where as Record<string, unknown>)
        .facings as Record<string, unknown> | undefined;
      const existingSome =
        (existingFacingsFilter?.some as Record<string, unknown>) ?? {};
      (where as Record<string, unknown>).facings = {
        some: { ...existingSome, roadWidth: widthFilter },
      };
    }

    // Only apply block filters if viewer is NOT an admin
    if (filters?.viewerId && !filters.isAdmin) {
      const blocks = await this.prisma.blockedUser.findMany({
        where: {
          OR: [
            { blockerId: filters.viewerId },
            { blockedId: filters.viewerId },
          ],
        },
      });
      if (blocks.length > 0) {
        const blockedSet = new Set<string>();
        for (const b of blocks) {
          if (b.blockerId === filters.viewerId) blockedSet.add(b.blockedId);
          if (b.blockedId === filters.viewerId) blockedSet.add(b.blockerId);
        }
        where.ownerId = { notIn: Array.from(blockedSet) };
      }
    }

    if (filters?.categoryId != null) {
      const propertyType = await resolvePropertyTypeForCategoryId(
        this.prisma,
        filters.categoryId,
      );
      if (propertyType) {
        where.AND = [landTypeMatchWhere(filters.categoryId, propertyType)];
      } else {
        where.categoryId = filters.categoryId;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          owner: { select: { id: true, fullName: true, email: true } },
          category: true,
          location: true,
          media: mediaIncludeOrdered,
          facings: true,
        },
      }),
      this.prisma.property.count({ where }),
    ]);
    const pages = Math.ceil(total / limit) || 0;
    return {
      items,
      pagination: { total, page, size: limit, pages },
    } satisfies PaginatedResult<(typeof items)[0]>;
  }

  private async ensurePropertyExists(id: string): Promise<void> {
    const exists = await this.prisma.property.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Property not found");
  }

  /**
   * Public post detail. Rejected posts are hidden unless the viewer is the owner or an admin.
   * Owners and admins receive `verificationLogs` (newest first) for moderation history.
   */
  async findOne(id: string, viewer?: { id: string; role: UserRole } | null) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        category: true,
        location: true,
        media: mediaIncludeOrdered,
        featureMapping: { include: { feature: true } },
        facings: true,
      },
    });
    if (!property) throw new NotFoundException("Property not found");

    const isOwner = viewer?.id != null && viewer.id === property.ownerId;
    const isAdmin = viewer?.role === UserRole.ADMIN;
    if (property.isBlocked && !isOwner && !isAdmin) {
      throw new NotFoundException("Property not found");
    }
    if (
      property.verificationStatus === VerificationStatus.REJECTED &&
      !isOwner &&
      !isAdmin
    ) {
      throw new NotFoundException("Property not found");
    }

    if (!isOwner && !isAdmin) {
      void this.prisma.property
        .update({
          where: { id },
          data: { views: { increment: 1 } },
        })
        .catch(() => undefined);
      return { ...property, views: property.views + 1 };
    }

    const verificationLogs = await this.prisma.propertyVerificationLog.findMany(
      {
        where: { propertyId: id },
        orderBy: { createdAt: "desc" },
        include: {
          verifiedBy: { select: { id: true, fullName: true, email: true } },
        },
      },
    );

    return { ...property, verificationLogs };
  }

  private async replacePropertyMedia(
    tx: Prisma.TransactionClient,
    propertyId: string,
    nextImages: string[],
    nextVideos: string[],
    prevImages: string[],
    prevVideos: string[],
  ) {
    const removedImages = prevImages.filter((u) => !nextImages.includes(u));
    const removedVideos = prevVideos.filter((u) => !nextVideos.includes(u));
    for (const url of [...removedImages, ...removedVideos]) {
      await this.uploadsService.deleteManagedPropertyMediaUrl(url);
    }

    await tx.propertyMedia.deleteMany({ where: { propertyId } });

    const rows: Prisma.PropertyMediaCreateManyInput[] = [];
    let sortOrder = 0;
    let primaryAssigned = false;
    for (const mediaUrl of nextImages) {
      const isPrimary = !primaryAssigned;
      primaryAssigned = true;
      rows.push({
        propertyId,
        mediaUrl,
        mediaType: "IMAGE",
        sortOrder: sortOrder++,
        isPrimary,
      });
    }
    for (const mediaUrl of nextVideos) {
      rows.push({
        propertyId,
        mediaUrl,
        mediaType: "VIDEO",
        sortOrder: sortOrder++,
        isPrimary: false,
      });
    }

    if (rows.length) {
      await tx.propertyMedia.createMany({ data: rows });
    }
  }

  private async applyPropertyUpdate(
    id: string,
    dto: UpdatePropertyDto,
  ): Promise<void> {
    await this.ensurePropertyExists(id);

    const {
      images: imagesPatch,
      videos: videosPatch,
      landTypeId,
      categoryId,
      facings: facingsPatch,
      ...rest
    } = dto;
    const resolvedCategoryId =
      landTypeId !== undefined || categoryId !== undefined
        ? (landTypeId ?? categoryId)
        : undefined;

    const landAreaSqFtPatch =
      dto.landArea !== undefined ||
      dto.landUnit !== undefined ||
      dto.guntas !== undefined
        ? (() => {
            const existing = {
              landArea: 0,
              landUnit: "sq_ft",
              guntas: undefined as number | undefined,
            };
            return toSqFt(
              Number(dto.landArea ?? existing.landArea),
              dto.landUnit ?? existing.landUnit,
              dto.guntas ?? existing.guntas,
            );
          })()
        : undefined;

    const restWithLandType = {
      ...rest,
      ...(resolvedCategoryId !== undefined
        ? { categoryId: resolvedCategoryId }
        : {}),
      ...(landAreaSqFtPatch !== undefined
        ? { landAreaSqFt: landAreaSqFtPatch }
        : {}),
    } as any;

    if (dto.propertyType === "FARM_LAND") {
      restWithLandType.gatedCommunity = null;
      restWithLandType.projectName = null;
    } else if (dto.propertyType === "PLOT") {
      restWithLandType.soilType = null;
      restWithLandType.waterAvailability = null;
      restWithLandType.irrigationType = null;
      restWithLandType.cropHistory = null;
    }

    const hasMediaPatch =
      imagesPatch !== undefined || videosPatch !== undefined;

    if (hasMediaPatch) {
      const existing = await this.prisma.property.findUnique({
        where: { id },
        include: { media: mediaIncludeOrdered },
      });
      if (!existing) throw new NotFoundException("Property not found");

      const prevImages = existing.media
        .filter((m) => m.mediaType === "IMAGE" || m.mediaType == null)
        .map((m) => m.mediaUrl);
      const prevVideos = existing.media
        .filter((m) => m.mediaType === "VIDEO")
        .map((m) => m.mediaUrl);

      const nextImages = imagesPatch !== undefined ? imagesPatch : prevImages;
      const nextVideos = videosPatch !== undefined ? videosPatch : prevVideos;

      if (nextImages.length > MAX_PROPERTY_IMAGES) {
        throw new BadRequestException(
          `Too many images. Maximum allowed is ${MAX_PROPERTY_IMAGES}`,
        );
      }
      if (nextVideos.length > MAX_PROPERTY_VIDEOS) {
        throw new BadRequestException(
          `Too many videos. Maximum allowed is ${MAX_PROPERTY_VIDEOS}`,
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await this.replacePropertyMedia(
          tx,
          id,
          nextImages,
          nextVideos,
          prevImages,
          prevVideos,
        );
        await tx.property.update({
          where: { id },
          data: {
            ...restWithLandType,
            images: nextImages as never,
          } as never,
        });
        if (facingsPatch !== undefined) {
          await tx.propertyFacing.deleteMany({ where: { propertyId: id } });
          if (facingsPatch.length > 0) {
            await tx.propertyFacing.createMany({
              data: facingsPatch.map((f) => ({
                propertyId: id,
                direction: f.direction,
                roadWidth: f.roadWidth ?? null,
              })),
            });
          }
        }
      });
    } else if (
      facingsPatch !== undefined ||
      Object.keys(restWithLandType).length > 0
    ) {
      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(restWithLandType).length > 0) {
          await tx.property.update({
            where: { id },
            data: restWithLandType as never,
          });
        }
        if (facingsPatch !== undefined) {
          await tx.propertyFacing.deleteMany({ where: { propertyId: id } });
          if (facingsPatch.length > 0) {
            await tx.propertyFacing.createMany({
              data: facingsPatch.map((f) => ({
                propertyId: id,
                direction: f.direction,
                roadWidth: f.roadWidth ?? null,
              })),
            });
          }
        }
      });
    }
  }

  async remove(id: string) {
    await this.ensurePropertyExists(id);
    return this.prisma.property.update({
      where: { id },
      data: { isDeleted: true, status: PropertyStatus.INACTIVE },
    });
  }

  async block(id: string) {
    await this.ensurePropertyExists(id);
    const property = await this.prisma.property.update({
      where: { id },
      data: { isBlocked: true, status: PropertyStatus.INACTIVE },
      include: { owner: true },
    });

    if (property.ownerId) {
      await this.notificationsService.sendPropertyBlockedNotification({
        userId: property.ownerId,
        propertyId: id,
        propertyTitle: property.title,
      });
    }

    return property;
  }

  async unblock(id: string) {
    await this.ensurePropertyExists(id);
    const property = await this.prisma.property.update({
      where: { id },
      data: { isBlocked: false, status: PropertyStatus.PUBLISHED },
      include: { owner: true },
    });

    if (property.ownerId) {
      await this.notificationsService.sendPropertyApprovedNotification({
        userId: property.ownerId,
        propertyId: id,
        propertyTitle: property.title,
        variant: "unblocked",
      });
    }

    return property;
  }

  async hardRemove(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { media: true },
    });
    if (!property) throw new NotFoundException("Property not found");
    const fromMedia = property.media.map((m) => m.mediaUrl);
    const rawImages = property.images;
    const fromJson = Array.isArray(rawImages)
      ? rawImages.filter(
          (u): u is string => typeof u === "string" && u.length > 0,
        )
      : [];
    const urls = [...new Set([...fromMedia, ...fromJson])];
    for (const url of urls) {
      await this.uploadsService.deleteManagedPropertyMediaUrl(url);
    }
    return this.prisma.property.delete({ where: { id } });
  }

  async assertOwner(
    id: string,
    user: { id: string; role: UserRole },
  ): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!property) throw new NotFoundException("Property not found");
    if (property.ownerId !== user.id) {
      throw new ForbiddenException(
        "Only the property owner can update post details",
      );
    }
  }

  async assertCanDelete(
    id: string,
    user: { id: string; role: UserRole },
  ): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!property) throw new NotFoundException("Property not found");
    if (user.role !== UserRole.ADMIN && property.ownerId !== user.id) {
      throw new ForbiddenException(
        "You are not allowed to delete this property",
      );
    }
  }

  async updateForUser(
    id: string,
    dto: UpdatePropertyDto,
    user: { id: string; role: UserRole },
  ) {
    await this.assertOwner(id, user);
    const prior = await this.prisma.property.findUnique({
      where: { id },
      select: { verificationStatus: true },
    });
    if (!prior) throw new NotFoundException("Property not found");
    const wasRejected =
      prior.verificationStatus === VerificationStatus.REJECTED;

    await this.applyPropertyUpdate(id, dto);

    if (wasRejected) {
      await this.prisma.property.update({
        where: { id },
        data: {
          verificationStatus: VerificationStatus.PENDING,
          status: PropertyStatus.DRAFT,
        },
      });
    }

    return this.findOne(id, user);
  }

  async approve(id: string, adminId: string) {
    await this.ensurePropertyExists(id);

    const publishedAt = new Date();
    const expiresAt = new Date(publishedAt);
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    const property = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.property.update({
        where: { id },
        data: {
          verificationStatus: VerificationStatus.VERIFIED,
          status: PropertyStatus.PUBLISHED,
          publishedAt,
          expiresAt,
          rejectionReason: null,
        },
        include: {
          owner: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
          category: true,
          location: true,
        },
      });

      return updated;
    });

    if (property.ownerId) {
      await this.notificationsService.sendPropertyApprovedNotification({
        userId: property.ownerId,
        propertyId: id,
        propertyTitle: property.title,
      });
    }

    const approvedCount = await this.prisma.property.count({
      where: {
        ownerId: property.ownerId,
        isDeleted: false,
        status: PropertyStatus.PUBLISHED,
        verificationStatus: VerificationStatus.VERIFIED,
      },
    });
    if (approvedCount === 1 && property.ownerId) {
      try {
        await this.referralsService.completeReferralOnFirstProperty(
          property.ownerId,
        );
      } catch (err) {
        this.logger.error(
          "Referral reward after first property approval failed",
          err as Error,
        );
      }
    }

    return property;
  }

  async reject(id: string, adminId: string, reason: string) {
    await this.ensurePropertyExists(id);

    const property = await this.prisma.$transaction(async (tx) => {
      const property = await tx.property.update({
        where: { id },
        data: {
          verificationStatus: VerificationStatus.REJECTED,
          status: PropertyStatus.REJECTED,
          rejectionReason: reason,
        },
        include: {
          owner: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
          category: true,
          location: true,
        },
      });

      return property;
    });

    if (property.ownerId) {
      await this.notificationsService.sendPropertyRejectedNotification({
        userId: property.ownerId,
        propertyId: id,
        propertyTitle: property.title,
        reason,
      });
    }

    return property;
  }

  async markAsSold(id: string, user: { id: string; role: UserRole }) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      select: { ownerId: true, status: true },
    });
    if (!property) throw new NotFoundException("Property not found");
    if (user.role !== UserRole.ADMIN && property.ownerId !== user.id) {
      throw new ForbiddenException(
        "Only the property owner can mark this as sold",
      );
    }
    if (property.status !== PropertyStatus.PUBLISHED) {
      throw new BadRequestException(
        "Only published properties can be marked as sold",
      );
    }
    return this.prisma.property.update({
      where: { id },
      data: { status: PropertyStatus.SOLD },
    });
  }

  async reactivate(id: string, user: { id: string; role: UserRole }) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      select: { ownerId: true, status: true, verificationStatus: true },
    });
    if (!property) throw new NotFoundException("Property not found");
    if (user.role !== UserRole.ADMIN && property.ownerId !== user.id) {
      throw new ForbiddenException(
        "Only the property owner can reactivate this post",
      );
    }
    if (
      property.status !== PropertyStatus.SOLD &&
      property.status !== PropertyStatus.INACTIVE
    ) {
      throw new BadRequestException(
        "Only sold or inactive properties can be reactivated",
      );
    }
    // Re-list without requiring re-review since it was already verified
    return this.prisma.property.update({
      where: { id },
      data: { status: PropertyStatus.PUBLISHED },
    });
  }

  async removeForUser(id: string, user: { id: string; role: UserRole }) {
    await this.assertCanDelete(id, user);
    const target = await this.prisma.property.findUnique({
      where: { id },
      select: { id: true, title: true, ownerId: true },
    });
    const removed = await this.remove(id);
    if (
      user.role === UserRole.ADMIN &&
      target?.ownerId &&
      target.ownerId !== user.id
    ) {
      await this.notificationsService.sendPropertyBlockedNotification({
        userId: target.ownerId,
        propertyId: id,
        propertyTitle: target.title,
        title: "Post removed by admin",
        message: `Your post "${target.title}" was removed by an administrator for policy/safety reasons.`,
      });
    }
    return removed;
  }
}
