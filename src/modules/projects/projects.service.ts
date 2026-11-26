import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Prisma,
  ProjectStatus,
  UserRole,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  PaginationDto,
  PaginatedResult,
} from '../../shared/dto/pagination.dto';
import { UploadsService } from '../uploads/uploads.service';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_PROJECT_IMAGES,
} from '../uploads/upload.constants';
import type { Express } from 'express';

const mediaIncludeOrdered = { orderBy: { sortOrder: 'asc' as const } };

const listInclude = {
  owner: { select: { id: true, fullName: true, email: true, phone: true } },
  location: true,
  media: mediaIncludeOrdered,
  _count: { select: { properties: true } },
} satisfies Prisma.ProjectInclude;

const detailInclude = {
  ...listInclude,
  featureMapping: { include: { feature: true } },
} satisfies Prisma.ProjectInclude;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
  ) {}

  async create(
    ownerId: string,
    dto: CreateProjectDto,
    files?: Express.Multer.File[],
  ) {
    const projectId = randomUUID();
    const imageFiles = (files ?? []).filter((f) =>
      ALLOWED_IMAGE_MIME_TYPES.includes(f.mimetype),
    );
    if (imageFiles.length > MAX_PROJECT_IMAGES) {
      throw new BadRequestException(
        `Too many images. Maximum allowed is ${MAX_PROJECT_IMAGES}`,
      );
    }

    const uploadedUrls = await this.uploadsService.uploadProjectImages(
      imageFiles,
    );
    const dtoImages = dto.images ?? [];
    const allImageUrls = [...dtoImages, ...uploadedUrls];

    const mediaPayload = allImageUrls.map((mediaUrl, sortOrder) => ({
      mediaUrl,
      thumbnailUrl: null as string | null,
      mediaType: 'IMAGE' as const,
      sortOrder,
      isPrimary: sortOrder === 0,
    }));

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
      featureIds,
      images: _images,
      ...projectFields
    } = dto;

    return this.prisma.project.create({
      data: {
        id: projectId,
        ...projectFields,
        state: state ?? '',
        district: district ?? '',
        mandal: mandal ?? '',
        village: village ?? null,
        ownerId,
        status: ProjectStatus.DRAFT,
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
        media: mediaPayload.length ? { create: mediaPayload } : undefined,
        featureMapping: featureIds?.length
          ? {
              create: featureIds.map((featureId) => ({ featureId })),
            }
          : undefined,
      },
      include: detailInclude,
    });
  }

  async findAll(
    pagination: PaginationDto,
    filters?: {
      q?: string;
      state?: string;
      district?: string;
      mandal?: string;
      isFeatured?: boolean;
      status?: ProjectStatus;
      verificationStatus?: VerificationStatus;
      ownerId?: string;
      includeDeleted?: boolean;
      onlyDeleted?: boolean;
      onlyBlocked?: boolean;
      excludeBlocked?: boolean;
      viewerId?: string;
      isAdmin?: boolean;
      sort?: string;
      lat?: number;
      lng?: number;
      radius?: number;
    },
  ): Promise<PaginatedResult<Prisma.ProjectGetPayload<{ include: typeof listInclude }>>> {
    const { page = 1, limit = 20 } = pagination;
    const where: Prisma.ProjectWhereInput = {
      isDeleted: filters?.onlyDeleted
        ? true
        : filters?.includeDeleted
          ? undefined
          : false,
    };

    if (filters?.onlyBlocked) where.isBlocked = true;
    if (filters?.excludeBlocked) {
      where.isBlocked = false;
      where.status = ProjectStatus.PUBLISHED;
      where.verificationStatus = VerificationStatus.VERIFIED;
      where.owner = {
        status: { not: UserStatus.BLOCKED },
        isSuspended: false,
      };
    }

    if (filters?.ownerId) where.ownerId = filters.ownerId;
    if (filters?.status) where.status = filters.status;
    if (filters?.verificationStatus) {
      where.verificationStatus = filters.verificationStatus;
    }
    if (filters?.isFeatured !== undefined) where.isFeatured = filters.isFeatured;
    if (filters?.state) where.state = filters.state;
    if (filters?.district) where.district = filters.district;
    if (filters?.mandal) where.mandal = filters.mandal;

    if (filters?.q) {
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
        { developerName: { contains: filters.q, mode: 'insensitive' } },
        { village: { contains: filters.q, mode: 'insensitive' } },
        { district: { contains: filters.q, mode: 'insensitive' } },
        { state: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

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

    const sort = filters?.sort ?? 'newest';
    const useNearby =
      sort === 'nearby' &&
      filters?.lat != null &&
      filters?.lng != null &&
      Number.isFinite(filters.lat) &&
      Number.isFinite(filters.lng);

    if (useNearby) {
      const radiusKm = filters.radius ?? 50;
      const all = await this.prisma.project.findMany({
        where: {
          ...where,
          location: {
            latitude: { not: null },
            longitude: { not: null },
          },
        },
        include: listInclude,
      });

      const ranked = all
        .map((p) => {
          const lat = Number(p.location?.latitude);
          const lng = Number(p.location?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const dist = haversineKm(filters.lat!, filters.lng!, lat, lng);
          return { item: p, dist };
        })
        .filter((x): x is { item: (typeof all)[0]; dist: number } => x != null)
        .filter((x) => x.dist <= radiusKm)
        .sort((a, b) => a.dist - b.dist);

      const total = ranked.length;
      const start = (page - 1) * limit;
      const items = ranked.slice(start, start + limit).map((r) => r.item);
      const pages = Math.ceil(total / limit) || 0;
      return {
        items,
        pagination: { total, page, size: limit, pages },
      };
    }

    let orderBy: Prisma.ProjectOrderByWithRelationInput;
    if (sort === 'price_asc') orderBy = { priceFrom: 'asc' };
    else if (sort === 'price_desc') orderBy = { priceFrom: 'desc' };
    else if (sort === 'oldest') orderBy = { createdAt: 'asc' };
    else orderBy = { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: listInclude,
      }),
      this.prisma.project.count({ where }),
    ]);

    const pages = Math.ceil(total / limit) || 0;
    return {
      items,
      pagination: { total, page, size: limit, pages },
    };
  }

  async findOne(id: string, viewer?: { id: string; role: UserRole } | null) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!project || project.isDeleted) {
      throw new NotFoundException('Project not found');
    }

    const isOwner = viewer?.id != null && viewer.id === project.ownerId;
    const isAdmin = viewer?.role === UserRole.ADMIN;
    if (project.isBlocked && !isOwner && !isAdmin) {
      throw new NotFoundException('Project not found');
    }
    if (
      project.verificationStatus === VerificationStatus.REJECTED &&
      !isOwner &&
      !isAdmin
    ) {
      throw new NotFoundException('Project not found');
    }
    if (
      project.status !== ProjectStatus.PUBLISHED &&
      !isOwner &&
      !isAdmin
    ) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async updateForUser(
    id: string,
    dto: UpdateProjectDto,
    user: { id: string; role: UserRole },
    files?: Express.Multer.File[],
  ) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project || project.isDeleted) {
      throw new NotFoundException('Project not found');
    }
    if (project.ownerId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Not allowed to update this project');
    }

    const imageFiles = (files ?? []).filter((f) =>
      ALLOWED_IMAGE_MIME_TYPES.includes(f.mimetype),
    );
    const uploadedUrls =
      imageFiles.length > 0
        ? await this.uploadsService.uploadProjectImages(imageFiles)
        : [];

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
      featureIds,
      images: imagesPatch,
      ...rest
    } = dto;

    const locationUpdate: Prisma.ProjectLocationUpdateInput = {};
    if (state !== undefined) locationUpdate.state = state;
    if (district !== undefined) locationUpdate.district = district;
    if (mandal !== undefined) locationUpdate.mandal = mandal;
    if (village !== undefined) locationUpdate.village = village || null;
    if (area !== undefined) locationUpdate.area = area || null;
    if (pincode !== undefined) locationUpdate.pincode = pincode || null;
    if (placeId !== undefined) locationUpdate.place_id = placeId || null;
    if (formattedAddress !== undefined) {
      locationUpdate.formatted_address = formattedAddress || null;
    }
    if (latitude !== undefined) locationUpdate.latitude = latitude ?? null;
    if (longitude !== undefined) locationUpdate.longitude = longitude ?? null;

    await this.prisma.$transaction(async (tx) => {
      if (imagesPatch !== undefined || uploadedUrls.length > 0) {
        const existing = await tx.projectMedia.findMany({
          where: { projectId: id },
        });
        const nextUrls = [
          ...(imagesPatch ?? existing.map((m) => m.mediaUrl)),
          ...uploadedUrls,
        ];
        const removed = existing.filter((m) => !nextUrls.includes(m.mediaUrl));
        for (const m of removed) {
          await this.uploadsService.deleteManagedPropertyMediaUrl(m.mediaUrl);
        }
        await tx.projectMedia.deleteMany({ where: { projectId: id } });
        if (nextUrls.length) {
          await tx.projectMedia.createMany({
            data: nextUrls.map((mediaUrl, sortOrder) => ({
              projectId: id,
              mediaUrl,
              mediaType: 'IMAGE',
              sortOrder,
              isPrimary: sortOrder === 0,
            })),
          });
        }
      }

      if (featureIds !== undefined) {
        await tx.projectFeatureMapping.deleteMany({ where: { projectId: id } });
        if (featureIds.length) {
          await tx.projectFeatureMapping.createMany({
            data: featureIds.map((featureId) => ({ projectId: id, featureId })),
          });
        }
      }

      await tx.project.update({
        where: { id },
        data: {
          ...rest,
          ...(state !== undefined ? { state } : {}),
          ...(district !== undefined ? { district } : {}),
          ...(mandal !== undefined ? { mandal } : {}),
          ...(village !== undefined ? { village: village ?? null } : {}),
          location:
            Object.keys(locationUpdate).length > 0
              ? { update: locationUpdate }
              : undefined,
        },
      });
    });

    return this.findOne(id, user);
  }

  async removeForUser(
    id: string,
    user: { id: string; role: UserRole },
  ) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Not allowed to delete this project');
    }
    await this.prisma.project.update({
      where: { id },
      data: { isDeleted: true, status: ProjectStatus.INACTIVE },
    });
    return { success: true };
  }

  async approve(id: string, _adminId: string) {
    const publishedAt = new Date();
    return this.prisma.project.update({
      where: { id },
      data: {
        verificationStatus: VerificationStatus.VERIFIED,
        status: ProjectStatus.PUBLISHED,
        publishedAt,
        rejectionReason: null,
      },
      include: detailInclude,
    });
  }

  async reject(id: string, _adminId: string, reason: string) {
    return this.prisma.project.update({
      where: { id },
      data: {
        verificationStatus: VerificationStatus.REJECTED,
        status: ProjectStatus.REJECTED,
        rejectionReason: reason,
      },
      include: detailInclude,
    });
  }

  async block(id: string) {
    return this.prisma.project.update({
      where: { id },
      data: { isBlocked: true },
    });
  }

  async unblock(id: string) {
    return this.prisma.project.update({
      where: { id },
      data: { isBlocked: false },
    });
  }
}
