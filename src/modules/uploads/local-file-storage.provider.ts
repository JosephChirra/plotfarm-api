import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';
import { randomUUID } from 'crypto';
import { FileStorageProvider } from './file-storage.provider';
import type { Express } from 'express';

@Injectable()
export class LocalFileStorageProvider implements FileStorageProvider {
  private readonly uploadsRoot = join(process.cwd(), 'uploads');

  async upload(file: Express.Multer.File, folder: string): Promise<string> {
    const safeFolder = folder.replace(/^\/*/, '').replace(/\/*$/, '');
    const targetDir = join(this.uploadsRoot, safeFolder);
    await fs.mkdir(targetDir, { recursive: true });

    const extension = extname(file.originalname || '').toLowerCase() || '.bin';
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    const targetPath = join(targetDir, fileName);

    await fs.writeFile(targetPath, file.buffer);
    return `/uploads/${safeFolder}/${fileName}`;
  }

  async delete(fileUrl: string): Promise<void> {
    if (!fileUrl) return;
    const fileName = basename(fileUrl);
    const normalized = fileUrl.replace(/^\/uploads\//, '');
    const absolute = join(this.uploadsRoot, normalized || fileName);
    try {
      await fs.unlink(absolute);
    } catch {
      // Ignore missing file errors for idempotent delete behavior.
    }
  }
}
