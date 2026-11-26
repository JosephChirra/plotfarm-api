import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateActivityLogDto {
  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  entityType?: string;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsString()
  @IsOptional()
  action?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
