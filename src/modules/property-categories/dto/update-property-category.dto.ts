import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpdatePropertyCategoryDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;
}
