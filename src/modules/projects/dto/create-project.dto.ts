import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsArray,
  MinLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { sanitizeString } from '../../../core/pipes/sanitize-string.transform';

const normalizeLocation = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : '';
};

export class CreateProjectDto {
  @IsString()
  @MinLength(3)
  @Transform(sanitizeString)
  title: string;

  @IsString()
  @IsOptional()
  @Transform(sanitizeString)
  description?: string;

  @IsString()
  @IsOptional()
  @Transform(sanitizeString)
  developerName?: string;

  @IsString()
  @MinLength(1)
  @Transform(sanitizeString)
  contactName: string;

  @IsString()
  @MinLength(10)
  contactPhone: string;

  @IsString()
  @Transform(normalizeLocation)
  state: string;

  @IsString()
  @Transform(normalizeLocation)
  district: string;

  @IsString()
  @Transform(normalizeLocation)
  mandal: string;

  @IsString()
  @IsOptional()
  @Transform(sanitizeString)
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
