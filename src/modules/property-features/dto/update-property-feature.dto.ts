import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpdatePropertyFeatureDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;
}
