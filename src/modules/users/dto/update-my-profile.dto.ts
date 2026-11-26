import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  ValidateIf,
  IsBoolean,
  IsEnum,
  IsEmail,
} from 'class-validator';

export enum AccountTypeDto {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
  BOTH = 'BOTH',
}

/** Self-service profile update (email supported for setting initial email on onboarding). */
export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(120)
  fullName?: string;

  /** 10-digit Indian mobile; omit to leave unchanged. */
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  profileImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  /** Maps to `User.district` (same as registration). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mandal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  village?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit alternate mobile number' })
  alternatePhone?: string;

  @IsOptional()
  @IsBoolean()
  showPhonePublicly?: boolean;

  @IsOptional()
  @IsEnum(AccountTypeDto)
  accountType?: AccountTypeDto;

  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{6}$/, { message: 'Pincode must be 6 digits' })
  pincode?: string;
}
