import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express } from 'express';
import { FILE_STORAGE_PROVIDER } from './file-storage.provider';
import type { FileStorageProvider } from './file-storage.provider';
import { MediaProcessingService } from './media-processing.service';

export type PropertyMediaType = 'IMAGE' | 'VIDEO' | 'DOCUMENT'; // [PDF_FUTURE] DOCUMENT added
export interface UploadedPropertyMedia {
  url: string;
  thumbnailUrl: string | null;
  type: PropertyMediaType;
}

@Injectable()
export class UploadsService {
  constructor(
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storageProvider: FileStorageProvider,
    private readonly config: ConfigService,
    private readonly mediaProcessing: MediaProcessingService,
  ) { }

  /** True if this URL was produced by our app storage (safe to delete on media replace). */
  isManagedPropertyMediaUrl(url: string): boolean {
    if (!url) return false;
    if (url.startsWith('/uploads/')) return true;
    const s3 = this.config.get('s3') as
      | { enabled?: boolean; bucket?: string; region?: string; endpoint?: string }
      | undefined;
    if (!s3?.enabled || !s3.bucket || !s3.region) return false;
    const defaultHost = `https://${s3.bucket}.s3.${s3.region}.amazonaws.com`;
    const ep = s3.endpoint?.replace(/\/$/, '') ?? '';
    return url.startsWith(defaultHost) || (!!ep && url.startsWith(ep));
  }

  async deleteManagedPropertyMediaUrl(url: string): Promise<void> {
    if (!this.isManagedPropertyMediaUrl(url)) return;
    await this.storageProvider.delete(url);
  }

  uploadPropertyImages(files: Express.Multer.File[]) {
    return Promise.all((files ?? []).map((file) => this.storageProvider.upload(file, 'properties')));
  }

  uploadProjectImages(files: Express.Multer.File[]) {
    return Promise.all((files ?? []).map((file) => this.storageProvider.upload(file, 'projects')));
  }

  async uploadProjectMedia(files: Express.Multer.File[]): Promise<UploadedPropertyMedia[]> {
    return Promise.all(
      (files ?? [])
        .filter((f) => f.mimetype.startsWith('image/'))
        .map(async (file) => {
          const { optimized, thumbnail } = await this.mediaProcessing.processImage(file.buffer);
          const optimizedFile = this.mediaProcessing.buildProcessedFile(file, optimized);
          const thumbFile = this.mediaProcessing.buildProcessedFile(file, thumbnail, '-thumb');
          const [url, thumbnailUrl] = await Promise.all([
            this.storageProvider.upload(optimizedFile, 'projects'),
            this.storageProvider.upload(thumbFile, 'projects/thumbnails'),
          ]);
          return { url, thumbnailUrl, type: 'IMAGE' as const };
        }),
    );
  }

  async uploadPropertyMedia(files: Express.Multer.File[]): Promise<UploadedPropertyMedia[]> {
    return Promise.all((files ?? []).map(async (file) => {
      const isVideo = file.mimetype.startsWith('video/');
      // [PDF_FUTURE] Uncomment when PDF uploads are enabled:
      // const isPdf = file.mimetype === 'application/pdf';

      if (isVideo) {
        // Upload original video + extract thumbnail frame
        const [url, thumbBuffer] = await Promise.all([
          this.storageProvider.upload(file, 'properties/videos'),
          this.mediaProcessing.extractVideoThumbnail(file.buffer, file.originalname),
        ]);

        let thumbnailUrl: string | null = null;
        if (thumbBuffer) {
          const thumbFile = this.mediaProcessing.buildProcessedFile(file, thumbBuffer, '-thumb');
          thumbnailUrl = await this.storageProvider.upload(thumbFile, 'properties/thumbnails');
        }

        return { url, thumbnailUrl, type: 'VIDEO' as const };

      // [PDF_FUTURE] else if (isPdf) {
      //   // Upload PDF as-is; optionally generate a preview image with pdf2pic/pdfjs
      //   const url = await this.storageProvider.upload(file, 'properties/documents');
      //   // const previewBuffer = await this.mediaProcessing.extractPdfPreview(file.buffer);
      //   // const thumbFile = this.mediaProcessing.buildProcessedFile(file, previewBuffer, '-thumb');
      //   // const thumbnailUrl = await this.storageProvider.upload(thumbFile, 'properties/thumbnails');
      //   return { url, thumbnailUrl: null, type: 'DOCUMENT' as const };
      // }

      } else {
        // Process image: convert to JPEG, resize, generate thumbnail
        const { optimized, thumbnail } = await this.mediaProcessing.processImage(file.buffer);

        const optimizedFile = this.mediaProcessing.buildProcessedFile(file, optimized);
        const thumbFile = this.mediaProcessing.buildProcessedFile(file, thumbnail, '-thumb');

        const [url, thumbnailUrl] = await Promise.all([
          this.storageProvider.upload(optimizedFile, 'properties/images'),
          this.storageProvider.upload(thumbFile, 'properties/thumbnails'),
        ]);

        return { url, thumbnailUrl, type: 'IMAGE' as const };
      }
    }));
  }

  uploadProfileImage(file?: Express.Multer.File) {
    if (!file) return Promise.resolve(undefined);
    return this.storageProvider.upload(file, 'profiles');
  }

  deleteByUrl(fileUrl: string) {
    return this.storageProvider.delete(fileUrl);
  }
}

