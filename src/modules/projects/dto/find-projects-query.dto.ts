import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsIn,
  IsEnum,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { ProjectStatus, VerificationStatus } from '@prisma/client';

export class FindProjectsQueryDto extends PaginationDto {
  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  mandal?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  isFeatured?: boolean;

  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @IsEnum(VerificationStatus)
  @IsOptional()
  verificationStatus?: VerificationStatus;

  @IsString()
  @IsOptional()
  ownerId?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  includeDeleted?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  onlyDeleted?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  onlyBlocked?: boolean;

  @IsIn(['newest', 'oldest', 'price_asc', 'price_desc', 'nearby'])
  @IsOptional()
  sort?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  lng?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  radius?: number;
}
