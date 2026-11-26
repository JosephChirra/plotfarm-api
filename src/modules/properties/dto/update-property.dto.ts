import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsEnum,
  IsBoolean,
  MinLength,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { CreatePropertyFacingDto, PlotFacingEnum } from './create-property.dto';

export enum PostTypeEnum {
  SALE = 'SALE',
  RENT = 'RENT',
  LEASE = 'LEASE',
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

export { PlotFacingEnum };

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

export class UpdatePropertyDto {
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

  @IsString()
  @MinLength(1)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  price?: number;

  @IsEnum(PostTypeEnum)
  @IsOptional()
  postType?: PostTypeEnum;

  @IsEnum(PropertyTypeEnum)
  @IsOptional()
  propertyType?: PropertyTypeEnum;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  landArea?: number;

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

  @IsEnum(OwnershipTypeEnum)
  @IsOptional()
  ownershipType?: OwnershipTypeEnum;

  @IsString()
  @IsOptional()
  nearbyLandmark?: string;

  @IsString()
  @IsOptional()
  soilType?: string;

  @IsBoolean()
  @IsOptional()
  waterAvailability?: boolean;

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

  @IsBoolean()
  @IsOptional()
  gatedCommunity?: boolean;

  @IsString()
  @IsOptional()
  projectName?: string;

  @IsBoolean()
  @IsOptional()
  roadAccess?: boolean;

  @IsBoolean()
  @IsOptional()
  electricityAvailable?: boolean;
}
