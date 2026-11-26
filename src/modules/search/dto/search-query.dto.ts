import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Max,
  Min,
} from 'class-validator';

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minArea?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxArea?: number;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  mandal?: string;

  @IsOptional()
  @IsString()
  village?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  waterAvailable?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  electricityAvailable?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  roadAccess?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  gatedCommunity?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postedWithinDays?: number;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? value.split(',') : undefined))
  facing?: string[];

  /**
   * Filter by land type id (Farm / Plot / …). Preferred query name.
   * @see categoryId — legacy alias; same meaning.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  landTypeId?: number;

  /** @deprecated Use `landTypeId`; same value and behavior. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @IsString()
  @IsIn(['newest', 'oldest', 'price_asc', 'price_desc', 'price_low', 'price_high', 'area_low', 'area_high', 'nearby'])
  sort?: string;

  @IsOptional()
  @IsString()
  postType?: string;

  @IsOptional()
  @IsString()
  ownershipType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  radius?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value == null ? 1 : value))
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (value == null ? 10 : value))
  limit = 10;
}
