import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum KycStatusEnum {
  NOT_SUBMITTED = 'NOT_SUBMITTED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export class CreateUserProfileDto {
  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  profileImageUrl?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsEnum(KycStatusEnum)
  @IsOptional()
  kycStatus?: KycStatusEnum;

  @IsString()
  @IsOptional()
  kycDocumentUrl?: string;
}
