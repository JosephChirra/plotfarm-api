import { IsString, IsOptional } from 'class-validator';

export class CreatePropertyVerificationLogDto {
  @IsString()
  propertyId: string;

  @IsString()
  @IsOptional()
  verifiedById?: string;

  @IsString()
  status: string; // VERIFIED | REJECTED

  @IsString()
  @IsOptional()
  remarks?: string;
}
