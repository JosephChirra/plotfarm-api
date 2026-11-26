import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  IsBoolean,
  IsNumber,
  IsDateString,
} from "class-validator";
import { ReferralStatus } from "@prisma/client";
import { Transform } from "class-transformer";

export class UpdateReferralConfigDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  signupBonus?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  referrerReward?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  refereeBonus?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  listingCostCredits?: number;

  /** Preferred name for `listingCostCredits` (compatibility alias). */
  @IsOptional()
  @IsInt()
  @Min(1)
  postCostCredits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  listingVisibilityDays?: number;

  /** Preferred name for `listingVisibilityDays` (compatibility alias). */
  @IsOptional()
  @IsInt()
  @Min(1)
  postVisibilityDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  newUserGrantListings?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  newUserGrantDays?: number;

  @IsOptional()
  referralTiers?: any;

  @IsOptional()
  @IsNumber()
  @Min(0)
  campaignBonusMultiplier?: number;

  @IsOptional()
  @IsDateString()
  campaignStartAt?: string;

  @IsOptional()
  @IsDateString()
  campaignEndAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  fraudAutoHoldScore?: number;

  @IsOptional()
  @IsBoolean()
  enableCreditExpiry?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  referralExpiryDays?: number;

  @IsOptional()
  @IsInt()
  maxReferralsPerUser?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyEarnCap?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminUpdateReferralDto {
  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  fraudScore?: number;
}

export class AdminSetCampaignDto {
  @IsNumber()
  @Min(1)
  multiplier!: number;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;
}

export class AdminRepairAttributionDto {
  @IsString()
  refereeId!: string;

  @IsString()
  referralCode!: string;
}

export class ListReferralsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;

  @IsOptional()
  @IsString()
  referrerId?: string;

  /** Search across referrer/referee name/email */
  @IsOptional()
  @IsString()
  q?: string;

  /** CreatedAt lower bound (inclusive) */
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  /** CreatedAt upper bound (inclusive) */
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  /**
   * If true, include lightweight progress fields in list rows
   * (batched posts + payouts; avoids per-row queries).
   */
  @IsOptional()
  @Transform(
    ({ value }) =>
      value === true || value === "true" || value === "1" || value === 1,
  )
  @IsBoolean()
  includeProgress?: boolean;
}
