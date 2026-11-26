import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePublicLeadDto {
  @IsString()
  @MinLength(1)
  propertyId: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  phone?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1, { message: 'Message is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message: string;
}

