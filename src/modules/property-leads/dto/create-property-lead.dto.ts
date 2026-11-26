import { IsString, IsOptional, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePropertyLeadDto {
  @IsString()
  propertyId: string;

  @IsString()
  @MinLength(1, { message: 'Inquiry message is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;
}
