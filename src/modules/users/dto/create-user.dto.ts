import { IsString, IsOptional, IsEmail, IsEnum, MinLength, Matches } from 'class-validator';

export enum UserRoleEnum {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum UserStatusEnum {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  PENDING = 'PENDING',
}

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @Matches(/^[0-9]{10,15}$/)
  phone: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(UserRoleEnum)
  role: UserRoleEnum;

  @IsEnum(UserStatusEnum)
  @IsOptional()
  status?: UserStatusEnum;
}
