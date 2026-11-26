import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { UploadsService } from './uploads.service';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_PROFILE_IMAGE_SIZE,
  MAX_PROPERTY_IMAGE_SIZE,
  MAX_PROPERTY_IMAGES,
  MAX_PROJECT_IMAGE_SIZE,
  MAX_PROJECT_IMAGES,
  MAX_UPLOAD_FILE_SIZE,
} from './upload.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('profile-image')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PROFILE_IMAGE_SIZE },
    }),
  )
  async uploadProfileImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file format. Allowed: jpg, png, webp');
    }
    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      throw new BadRequestException('Image must be 2MB or smaller');
    }
    const url = await this.uploads.uploadProfileImage(file);
    if (!url) throw new BadRequestException('Upload failed');
    return { url };
  }

  @Post('property-images')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Invalid file format. Allowed images: jpg, png, webp'),
            false,
          );
        }
        if (file.size > MAX_PROPERTY_IMAGE_SIZE) {
          return cb(new BadRequestException('Image size exceeds maximum of 10MB'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadPropertyImages(@UploadedFiles() files?: Express.Multer.File[]) {
    const imageFiles = (files ?? []).filter((f) => ALLOWED_IMAGE_MIME_TYPES.includes(f.mimetype));
    if (imageFiles.length > MAX_PROPERTY_IMAGES) {
      throw new BadRequestException(`Too many images. Maximum allowed is ${MAX_PROPERTY_IMAGES}`);
    }
    if (imageFiles.length === 0) {
      throw new BadRequestException('At least one image file is required');
    }
    const urls = await this.uploads.uploadPropertyImages(imageFiles);
    return { urls };
  }

  @Post('project-images')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Invalid file format. Allowed images: jpg, png, webp'),
            false,
          );
        }
        if (file.size > MAX_PROJECT_IMAGE_SIZE) {
          return cb(new BadRequestException('Image size exceeds maximum of 10MB'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadProjectImages(@UploadedFiles() files?: Express.Multer.File[]) {
    const imageFiles = (files ?? []).filter((f) => ALLOWED_IMAGE_MIME_TYPES.includes(f.mimetype));
    if (imageFiles.length > MAX_PROJECT_IMAGES) {
      throw new BadRequestException(`Too many images. Maximum allowed is ${MAX_PROJECT_IMAGES}`);
    }
    if (imageFiles.length === 0) {
      throw new BadRequestException('At least one image file is required');
    }
    const urls = await this.uploads.uploadProjectImages(imageFiles);
    return { urls };
  }
}
