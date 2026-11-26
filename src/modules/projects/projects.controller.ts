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
import { ProjectStatus, UserRole } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { FindProjectsQueryDto } from './dto/find-projects-query.dto';
import { RejectProjectDto } from './dto/reject-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_PROJECT_IMAGE_SIZE,
  MAX_PROJECT_IMAGES,
  MAX_UPLOAD_FILE_SIZE,
} from '../uploads/upload.constants';
import type { Express } from 'express';

@Controller('projects')
export class ProjectsController {
  constructor(private service: ProjectsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE },
      fileFilter: (_, file, cb) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Invalid file format. Allowed images: jpg, png, webp',
            ),
            false,
          );
        }
        if (file.size > MAX_PROJECT_IMAGE_SIZE) {
          return cb(
            new BadRequestException('Image size exceeds maximum of 10MB'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser('id') ownerId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const imageCount = (files ?? []).filter((f) =>
      ALLOWED_IMAGE_MIME_TYPES.includes(f.mimetype),
    ).length;
    if (imageCount > MAX_PROJECT_IMAGES) {
      throw new BadRequestException(
        `Too many images. Maximum allowed is ${MAX_PROJECT_IMAGES}`,
      );
    }
    return this.service.create(ownerId, dto, files);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Query() query: FindProjectsQueryDto,
    @Req() req: Request & { user?: { id: string; role: UserRole } },
  ) {
    const {
      page,
      limit,
      q,
      state,
      district,
      mandal,
      isFeatured,
      status,
      verificationStatus,
      includeDeleted,
      onlyDeleted,
      onlyBlocked,
      ownerId,
      sort,
      lat,
      lng,
      radius,
    } = query;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    const effectiveStatus =
      !isAdmin && !status ? ProjectStatus.PUBLISHED : status;
    const effectiveVerification =
      !isAdmin && !verificationStatus
        ? undefined
        : verificationStatus;
    return this.service.findAll(
      { page, limit },
      {
        q,
        state,
        district,
        mandal,
        isFeatured,
        status: effectiveStatus,
        verificationStatus: effectiveVerification,
        ownerId: ownerId || undefined,
        includeDeleted,
        onlyDeleted,
        onlyBlocked,
        excludeBlocked: !isAdmin && !ownerId,
        viewerId: req.user?.id,
        isAdmin,
        sort,
        lat,
        lng,
        radius,
      },
    );
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(
    @Query() query: FindProjectsQueryDto,
    @CurrentUser('id') ownerId: string,
  ) {
    const { page, limit, q, state, district, mandal, status, verificationStatus, sort } =
      query;
    return this.service.findAll(
      { page, limit },
      {
        ownerId,
        q,
        state,
        district,
        mandal,
        status,
        verificationStatus,
        excludeBlocked: false,
        sort,
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
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE },
      fileFilter: (_, file, cb) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Invalid file format. Allowed images: jpg, png, webp',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: { id: string; role: UserRole },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.service.updateForUser(id, dto, user, files);
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
    @Body() dto: RejectProjectDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.reject(id, adminId, dto.reason);
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
