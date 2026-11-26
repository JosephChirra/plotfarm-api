import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export enum MediaTypeEnum {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

export class CreatePropertyMediaDto {
  @IsString()
  propertyId: string;

  @IsString()
  mediaUrl: string;

  @IsEnum(MediaTypeEnum)
  @IsOptional()
  mediaType?: MediaTypeEnum;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}
