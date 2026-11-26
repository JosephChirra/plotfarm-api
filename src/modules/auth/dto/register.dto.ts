import { IsEmail, IsString, IsOptional, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeString } from '../../../core/pipes/sanitize-string.transform';

export class RegisterDto {
  @Transform(sanitizeString)
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^[0-9]{10,15}$/)
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(2)
  state: string;

  @IsString()
  @MinLength(2)
  district: string;

  /** Optional referral code passed when registering via a referral link */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  referralCode?: string;
}
