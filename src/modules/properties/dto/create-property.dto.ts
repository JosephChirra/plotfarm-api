import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsEnum,
  IsBoolean,
  IsArray,
  MinLength,
  ValidateIf,
  ValidateNested,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { sanitizeString } from '../../../core/pipes/sanitize-string.transform';

export enum PostTypeEnum {
  SALE = 'SALE',
  RENT = 'RENT',
  LEASE = 'LEASE',
}

export enum PropertyStatusEnum {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  INACTIVE = 'INACTIVE',
  REJECTED = 'REJECTED',
  SOLD = 'SOLD',
}

export enum PropertyTypeEnum {
  FARM_LAND = 'FARM_LAND',
  PLOT = 'PLOT',
}

export enum OwnershipTypeEnum {
  OWNER = 'OWNER',
  DEALER = 'DEALER',
}

export enum IrrigationTypeEnum {
  BOREWELL = 'BOREWELL',
  CANAL = 'CANAL',
  RAIN = 'RAIN',
}

export enum PlotFacingEnum {
  EAST = 'EAST',
  WEST = 'WEST',
  NORTH = 'NORTH',
  SOUTH = 'SOUTH',
}

export class CreatePropertyFacingDto {
  @IsEnum(PlotFacingEnum)
  direction: PlotFacingEnum;

  @IsNumber()
  @Min(0)
  @IsOptional()
  roadWidth?: number;
}

function normalizeFacingsInput(value: unknown): unknown {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return parsed;
    }
  }
  if (!Array.isArray(parsed)) return parsed;
  return parsed.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const candidate = item as Record<string, unknown>;
    const nested = candidate.property;
    const target = (nested && typeof nested === 'object') ? nested : candidate;
    return plainToInstance(CreatePropertyFacingDto, target);
  });
}

const normalizeLocation = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : '';
};

export class CreatePropertyDto {
  /**
   * Land type id (e.g. FARM_LAND, PLOT). Preferred field name.
   * @see categoryId — legacy alias; same meaning.
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  landTypeId?: number;

  /** @deprecated Use `landTypeId`; same value and behavior. */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  categoryId?: number;

  @Transform(sanitizeString)
  @IsString()
  @MinLength(1)
  title: string;

  @Transform(sanitizeString)
  @IsString()
  @MinLength(1)
  description: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  price?: number;

  @IsEnum(PostTypeEnum)
  postType: PostTypeEnum;

  @IsEnum(PropertyTypeEnum)
  propertyType: PropertyTypeEnum;

  @IsNumber()
  @Type(() => Number)
  landArea: number;

  @IsString()
  @IsOptional()
  landUnit?: string;

  /** Optional sub-acre guntas (South India). Only meaningful when landUnit === 'acres'. 0–39 */
  @IsInt()
  @Min(0)
  @Max(39)
  @IsOptional()
  @Type(() => Number)
  guntas?: number;

  @IsString()
  @IsOptional()
  facing?: string;

  @IsEnum(PropertyStatusEnum)
  @IsOptional()
  status?: PropertyStatusEnum;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  seoMetaTitle?: string;

  @IsString()
  @IsOptional()
  seoMetaDescription?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  videos?: string[];

  @IsEnum(OwnershipTypeEnum)
  @IsOptional()
  ownershipType?: OwnershipTypeEnum;

  @IsString()
  @IsOptional()
  nearbyLandmark?: string;

  @IsString()
  @MinLength(1)
  @Transform(({ value }) => normalizeLocation(value))
  state: string;

  @IsString()
  @MinLength(1)
  @Transform(({ value }) => normalizeLocation(value))
  district: string;

  @IsString()
  @MinLength(1)
  @Transform(({ value }) => normalizeLocation(value))
  mandal: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => normalizeLocation(value))
  village?: string;

  @IsString()
  @IsOptional()
  area?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit number' })
  pincode?: string;

  @IsString()
  @IsOptional()
  placeId?: string;

  @IsString()
  @IsOptional()
  formattedAddress?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsString()
  @IsOptional()
  soilType?: string;

  @Transform(({ obj }) => {
    const v = obj['waterAvailability'];
    return v === 'true' || v === true;
  })
  @IsBoolean()
  @IsOptional()
  waterAvailability?: boolean;

  @ValidateIf((o) => o.propertyType === PropertyTypeEnum.FARM_LAND)
  @IsEnum(IrrigationTypeEnum)
  @IsOptional()
  irrigationType?: IrrigationTypeEnum;

  @IsString()
  @IsOptional()
  cropHistory?: string;

  @Transform(({ value }) => normalizeFacingsInput(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePropertyFacingDto)
  @IsOptional()
  facings?: CreatePropertyFacingDto[];

  @Transform(({ obj }) => {
    const v = obj['gatedCommunity'];
    return v === 'true' || v === true;
  })
  @IsBoolean()
  @IsOptional()
  gatedCommunity?: boolean;

  @IsString()
  @IsOptional()
  projectName?: string;

  @Transform(({ obj }) => {
    const v = obj['roadAccess'];
    return v === 'true' || v === true;
  })
  @IsBoolean()
  @IsOptional()
  roadAccess?: boolean;

  @Transform(({ obj }) => {
    const v = obj['electricityAvailable'];
    return v === 'true' || v === true;
  })
  @IsBoolean()
  @IsOptional()
  electricityAvailable?: boolean;
}
