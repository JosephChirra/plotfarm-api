import { Transform } from 'class-transformer';
import { IsString, Matches, IsOptional, IsEnum } from 'class-validator';

export class RequestPhoneOtpDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone: string;

  @IsOptional()
  @IsEnum(['SMS', 'WHATSAPP'])
  channel?: 'SMS' | 'WHATSAPP';
}
