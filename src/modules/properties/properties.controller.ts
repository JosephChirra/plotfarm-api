import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole, PropertyStatus } from '@prisma/client';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { FindPropertiesQueryDto } from './dto/find-properties-query.dto';
import { RejectPropertyDto } from './dto/reject-property.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_PROPERTY_IMAGE_SIZE,
  MAX_PROPERTY_IMAGES,
  MAX_PROPERTY_VIDEO_SIZE,
  MAX_PROPERTY_VIDEOS,
  MAX_UPLOAD_FILE_SIZE,
} from '../uploads/upload.constants';
import type { Express } from 'express';

@Controller('properties')
export class PropertiesController {
  constructor(private service: PropertiesService) { }

  @Post()
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE },
      fileFilter: (_, file, cb) => {
        const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype);
        const isVideo = ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype);
        if (!isImage && !isVideo) {
          return cb(
            new BadRequestException('Invalid file format. Allowed images: jpg, png, webp; videos: mp4, webm, quicktime'),
            false,
          );
        }

        if (isImage && file.size > MAX_PROPERTY_IMAGE_SIZE) {
          return cb(new BadRequestException('Image size exceeds maximum of 10MB'), false);
        }

        if (isVideo && file.size > MAX_PROPERTY_VIDEO_SIZE) {
          return cb(new BadRequestException('Video size exceeds maximum of 100MB'), false);
        }

        cb(null, true);
      },
    }),
  )
  create(
    @Body() dto: CreatePropertyDto,
    @CurrentUser('id') ownerId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const imageCount = (files ?? []).filter((f) => ALLOWED_IMAGE_MIME_TYPES.includes(f.mimetype)).length;
    const videoCount = (files ?? []).filter((f) => ALLOWED_VIDEO_MIME_TYPES.includes(f.mimetype)).length;

    if (imageCount > MAX_PROPERTY_IMAGES) {
      throw new BadRequestException(`Too many images. Maximum allowed is ${MAX_PROPERTY_IMAGES}`);
    }
    if (videoCount > MAX_PROPERTY_VIDEOS) {
      throw new BadRequestException(`Too many videos. Maximum allowed is ${MAX_PROPERTY_VIDEOS}`);
    }

    return this.service.create(ownerId, dto, files);
  }

  @Get('my-quota')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  getMyQuota(@CurrentUser('id') userId: string) {
    return this.service.getMyQuota(userId);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Query() query: FindPropertiesQueryDto,
    @Req() req: Request & { user?: { id: string; role: UserRole } },
  ) {
    const {
      page,
      limit,
      landTypeId,
      categoryId,
      status,
      verificationStatus,
      postType,
      ownershipType,
      state,
      maxPrice,
      maxArea,
      facingDirections,
      minRoadWidth,
      maxRoadWidth,
      includeDeleted,
      onlyDeleted,
      onlyBlocked,
      ownerId,
    } = query;
    const resolvedLandTypeId = landTypeId ?? categoryId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    // Public browse defaults to PUBLISHED only; admins can override with explicit status param
    const effectiveStatus = !isAdmin && !status ? PropertyStatus.PUBLISHED : status;
    return this.service.findAll(
      { page, limit },
      {
        ownerId: ownerId || undefined,
        categoryId: resolvedLandTypeId ? Number(resolvedLandTypeId) : undefined,
        status: effectiveStatus,
        verificationStatus,
        postType,
        ownershipType,
        state,
        maxPrice,
        maxArea,
        facingDirections,
        minRoadWidth,
        maxRoadWidth,
        includeDeleted,
        onlyDeleted,
        onlyBlocked,
        isAdmin,
        excludeBlocked: !isAdmin,
        viewerId: req.user?.id,
      },
    );
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(
    @Query() query: FindPropertiesQueryDto,
    @CurrentUser('id') ownerId: string,
  ) {
    const {
      page,
      limit,
      landTypeId,
      categoryId,
      status,
      verificationStatus,
      postType,
      state,
      maxPrice,
      maxArea,
      facingDirections,
      minRoadWidth,
      maxRoadWidth,
    } = query;
    const resolvedLandTypeId = landTypeId ?? categoryId;
    return this.service.findAll(
      { page, limit },
      {
        ownerId,
        categoryId: resolvedLandTypeId ? Number(resolvedLandTypeId) : undefined,
        status,
        verificationStatus,
        postType,
        state,
        maxPrice,
        maxArea,
        facingDirections,
        minRoadWidth,
        maxRoadWidth,
        excludeBlocked: false,
      },
    );
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Param('id') id: string,
    @Req() req: Request & { user?: { id: string; role: UserRole } },
  ) {
    return this.service.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePropertyDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.updateForUser(id, dto, user);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  approve(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.approve(id, adminId);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectPropertyDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.reject(id, adminId, dto.reason);
  }

  @Post(':id/mark-sold')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  markAsSold(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.markAsSold(id, user);
  }

  @Post(':id/reactivate')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  reactivate(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.reactivate(id, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.removeForUser(id, user);
  }

  @Post(':id/block')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  block(@Param('id') id: string) {
    return this.service.block(id);
  }

  @Post(':id/unblock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  unblock(@Param('id') id: string) {
    return this.service.unblock(id);
  }
}
