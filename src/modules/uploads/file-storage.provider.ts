import type { Express } from 'express';

export const FILE_STORAGE_PROVIDER = 'FILE_STORAGE_PROVIDER';

export interface FileStorageProvider {
  upload(file: Express.Multer.File, folder: string): Promise<string>;
  delete(fileUrl: string): Promise<void>;
}
