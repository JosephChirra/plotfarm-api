import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeString } from '../../../core/pipes/sanitize-string.transform';

export class RejectProjectDto {
  @IsString()
  @MinLength(3)
  @Transform(sanitizeString)
  reason: string;
}
