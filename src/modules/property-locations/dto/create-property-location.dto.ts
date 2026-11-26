import { IsString, IsOptional, IsNumber, MinLength, Min, Max, Matches } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const normalizeLocation = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : '';
};

export class CreatePropertyLocationDto {
  @IsString()
  propertyId: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @MinLength(1)
  @Transform(({ value }) => normalizeLocation(value))
  mandal: string;

  @IsString()
  @MinLength(1)
  @Transform(({ value }) => normalizeLocation(value))
  district: string;

  @IsString()
  @MinLength(1)
  @Transform(({ value }) => normalizeLocation(value))
  state: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => normalizeLocation(value))
  village?: string;

  @IsString()
  @IsOptional()
  country?: string;

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

  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  longitude: number;
}
