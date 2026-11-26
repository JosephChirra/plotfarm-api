import { IsString, MinLength } from 'class-validator';

export class CreatePropertyFeatureDto {
  @IsString()
  @MinLength(1)
  name: string;
}
