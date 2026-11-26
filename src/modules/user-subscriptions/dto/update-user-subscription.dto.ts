import { IsNumber, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum SubscriptionStatusEnum {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export class UpdateUserSubscriptionDto {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  planId?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsEnum(SubscriptionStatusEnum)
  @IsOptional()
  status?: SubscriptionStatusEnum;
}
