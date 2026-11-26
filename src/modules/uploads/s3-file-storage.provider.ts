import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { FileStorageProvider } from './file-storage.provider';
import type { Express } from 'express';

interface S3Config {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    enabled?: boolean;
}

@Injectable()
export class S3FileStorageProvider implements FileStorageProvider {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly region: string;
    private readonly endpoint: string | undefined;

    constructor(config: S3Config) {
        if (!config.bucket || !config.region || !config.accessKeyId || !config.secretAccessKey) {
            throw new InternalServerErrorException('Incomplete S3 configuration');
        }

        this.bucket = config.bucket;
        this.region = config.region;
        this.endpoint = config.endpoint || '';

        this.client = new S3Client({
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            endpoint: config.endpoint ? config.endpoint : undefined,
            forcePathStyle: config.forcePathStyle ?? false,
        });
    }

    private buildKey(folder: string, fileName: string) {
        const safeFolder = folder.replace(/^\/*/, '').replace(/\/*$/, '');
        return `${safeFolder ? `${safeFolder}/` : ''}${fileName}`;
    }

    async upload(file: Express.Multer.File, folder: string): Promise<string> {
        const extension = extname(file.originalname || '').toLowerCase() || '.bin';
        const fileName = `${Date.now()}-${randomUUID()}${extension}`;
        const key = this.buildKey(folder, fileName);

        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype,
            }),
        );

        if (this.endpoint) {
            const endpoint = this.endpoint.replace(/\/$/, '');
            return `${endpoint}/${key}`;
        }

        const host = `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
        return `${host}/${key}`;
    }

    async delete(fileUrl: string): Promise<void> {
        if (!fileUrl) return;

        let key = fileUrl;
        const defaultHost = `https://${this.bucket}.s3.${this.region}.amazonaws.com`;

        if (this.endpoint && fileUrl.startsWith(this.endpoint)) {
            key = fileUrl.slice(this.endpoint.replace(/\/$/, '').length);
        } else if (fileUrl.startsWith(defaultHost)) {
            key = fileUrl.slice(defaultHost.length);
        }

        key = key.replace(/^\/+/, '');

        if (!key) return;

        try {
            await this.client.send(
                new DeleteObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                }),
            );
        } catch {
            // Idempotent behavior, ignore missing object errors.
        }
    }
}
