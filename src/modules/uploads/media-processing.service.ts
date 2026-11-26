import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
// fluent-ffmpeg is a CommonJS module — use require for nodenext compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg = require('fluent-ffmpeg') as typeof import('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

/** Max width for full-size optimized images (px) */
const IMAGE_MAX_WIDTH = 1920;
/** JPEG quality for full-size images (0–100) */
const IMAGE_QUALITY = 82;
/** Max width for thumbnail images (px) */
const THUMB_MAX_WIDTH = 640;
/** JPEG quality for thumbnails */
const THUMB_QUALITY = 70;

export interface ProcessedImage {
  /** Optimized full-size JPEG buffer */
  optimized: Buffer;
  /** Thumbnail JPEG buffer */
  thumbnail: Buffer;
}

@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name);

  /**
   * Convert any image to optimized JPEG + a smaller thumbnail JPEG.
   * Safe fallback: if processing fails the original buffer is returned as-is.
   */
  async processImage(input: Buffer): Promise<ProcessedImage> {
    try {
      const [optimized, thumbnail] = await Promise.all([
        sharp(input)
          .rotate() // auto-orient from EXIF
          .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: IMAGE_QUALITY, progressive: true, mozjpeg: true })
          .toBuffer(),
        sharp(input)
          .rotate()
          .resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: THUMB_QUALITY, progressive: true })
          .toBuffer(),
      ]);
      return { optimized, thumbnail };
    } catch (err) {
      this.logger.error('Image processing failed, using original', err);
      return { optimized: input, thumbnail: input };
    }
  }

  /**
   * Extract the first video frame (at 1 second) as a JPEG thumbnail.
   * Returns null if extraction fails (video still uploads without thumbnail).
   */
  async extractVideoThumbnail(videoBuffer: Buffer, originalName: string): Promise<Buffer | null> {
    const tmpDir = os.tmpdir();
    const ext = path.extname(originalName) || '.mp4';
    const tmpInput = path.join(tmpDir, `pf-vid-${Date.now()}${ext}`);
    const tmpThumb = path.join(tmpDir, `pf-thumb-${Date.now()}.jpg`);

    try {
      await fs.writeFile(tmpInput, videoBuffer);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(tmpInput)
          .screenshots({
            timestamps: ['00:00:01'],
            filename: path.basename(tmpThumb),
            folder: path.dirname(tmpThumb),
            size: `${THUMB_MAX_WIDTH}x?`,
          })
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err));
      });

      const thumbBuffer = await fs.readFile(tmpThumb);
      return thumbBuffer;
    } catch (err) {
      this.logger.warn(`Video thumbnail extraction failed for ${originalName}`, err);
      return null;
    } finally {
      await Promise.allSettled([
        fs.unlink(tmpInput).catch(() => {}),
        fs.unlink(tmpThumb).catch(() => {}),
      ]);
    }
  }

  /** Build a fake Multer-like file object from a processed buffer for the storage provider */
  buildProcessedFile(
    original: Express.Multer.File,
    buffer: Buffer,
    suffix = '',
  ): Express.Multer.File {
    return {
      ...original,
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
      originalname: `${path.parse(original.originalname).name}${suffix}.jpg`,
    };
  }
}
