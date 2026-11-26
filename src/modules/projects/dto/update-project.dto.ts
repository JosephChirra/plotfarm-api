import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  MinLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { sanitizeString } from '../../../core/pipes/sanitize-string.transform';

export class UpdateProjectDto {
  @IsString()
  @MinLength(3)
  @IsOptional()
  @Transform(sanitizeString)
  title?: string;

  @IsString()
  @IsOptional()
  @Transform(sanitizeString)
  description?: string;

  @IsString()
  @IsOptional()
  @Transform(sanitizeString)
  developerName?: string;

  @IsString()
  @IsOptional()
  @Transform(sanitizeString)
  contactName?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  mandal?: string;

  @IsString()
  @IsOptional()
  village?: string;

  @IsString()
  @IsOptional()
  area?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  placeId?: string;

  @IsString()
  @IsOptional()
  formattedAddress?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  latitude?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  longitude?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  totalPlots?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  availablePlots?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  priceFrom?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  priceTo?: number;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  isFeatured?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  @Type(() => Number)
  featureIds?: number[];
}
