import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, IsEnum } from 'class-validator';

export class VerifyPhoneOtpDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^\d{6}$/)
  otp: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsEnum(['SMS', 'WHATSAPP'])
  channel?: 'SMS' | 'WHATSAPP';
}
