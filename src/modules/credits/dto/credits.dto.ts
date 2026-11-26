import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CreditTransactionType } from '@prisma/client';

export class CreditIssuedDto {
  @IsInt() @Min(1)
  amount: number;

  @IsEnum(CreditTransactionType)
  type: CreditTransactionType;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional() @IsString()
  referralId?: string;

  @IsOptional()
  expiresAt?: Date;

  @IsOptional() @IsString()
  idempotencyKey?: string;

  /** Optional extra keys that should be treated as aliases for dedupe. */
  @IsOptional() @IsArray() @IsString({ each: true })
  idempotencyKeyAliases?: string[];

  @IsOptional() @IsString()
  source?: string;
}

export class CreditSpendDto {
  @IsInt() @Min(1)
  amount: number;

  @IsEnum(CreditTransactionType)
  type: CreditTransactionType;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional() @IsString()
  idempotencyKey?: string;

  /** Optional extra keys that should be treated as aliases for dedupe. */
  @IsOptional() @IsArray() @IsString({ each: true })
  idempotencyKeyAliases?: string[];

  @IsOptional() @IsString()
  source?: string;
}

export class AdminAdjustCreditsDto {
  @IsString()
  userId: string;

  @IsInt() @Min(1)
  amount: number;

  @IsOptional() @IsString()
  reason?: string;
}

export class ConsumeCreditsDto {
  @IsInt() @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
