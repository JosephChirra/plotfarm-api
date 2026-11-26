import { IsOptional, IsInt, Min, Max, IsString, IsEnum, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyStatus, VerificationStatus } from '@prisma/client';

export class FindPropertiesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /**
   * Filter by land type id (Farm / Plot / …). Preferred query name.
   * Use numeric id (same as SearchQueryDto); strings are coerced via @Type.
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
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @IsOptional()
  @IsString()
  postType?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  ownershipType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxArea?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  facingDirections?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minRoadWidth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxRoadWidth?: number;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @Type(() => Boolean)
  includeDeleted?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  onlyDeleted?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  onlyBlocked?: boolean;
}
