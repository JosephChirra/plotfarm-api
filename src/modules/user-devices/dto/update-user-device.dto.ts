import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpdateUserDeviceDto {
  @IsString()
  @IsOptional()
  deviceId?: string;

  @IsString()
  @IsOptional()
  deviceType?: string;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;

  @IsDateString()
  @IsOptional()
  lastLoginAt?: string;
}
