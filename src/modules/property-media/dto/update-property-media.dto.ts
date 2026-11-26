import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export enum MediaTypeEnum {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

export class UpdatePropertyMediaDto {
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @IsEnum(MediaTypeEnum)
  @IsOptional()
  mediaType?: MediaTypeEnum;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}
