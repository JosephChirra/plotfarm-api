import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { LocalFileStorageProvider } from './local-file-storage.provider';
import { S3FileStorageProvider } from './s3-file-storage.provider';
import { FILE_STORAGE_PROVIDER } from './file-storage.provider';
import { MediaProcessingService } from './media-processing.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    MediaProcessingService,
    {
      provide: FILE_STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const s3Config = config.get('s3') as {
          enabled?: boolean;
          bucket?: string;
          region?: string;
          accessKeyId?: string;
          secretAccessKey?: string;
          endpoint?: string;
          forcePathStyle?: boolean;
        };

        if (
          s3Config?.enabled &&
          s3Config.bucket &&
          s3Config.region &&
          s3Config.accessKeyId &&
          s3Config.secretAccessKey
        ) {
          return new S3FileStorageProvider({
            bucket: s3Config.bucket,
            region: s3Config.region,
            accessKeyId: s3Config.accessKeyId,
            secretAccessKey: s3Config.secretAccessKey,
            endpoint: s3Config.endpoint,
            forcePathStyle: s3Config.forcePathStyle,
          });
        }

        return new LocalFileStorageProvider();
      },
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule { }
