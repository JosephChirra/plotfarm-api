import { IsString, IsOptional, IsEmail, IsEnum, MinLength } from 'class-validator';

export enum UserRoleEnum {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum UserStatusEnum {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  PENDING = 'PENDING',
}

export class UpdateUserDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  fullName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsEnum(UserRoleEnum)
  @IsOptional()
  role?: UserRoleEnum;

  @IsEnum(UserStatusEnum)
  @IsOptional()
  status?: UserStatusEnum;
}
