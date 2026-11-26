import { IsString, MinLength } from 'class-validator';

export class CreatePropertyCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;
}
