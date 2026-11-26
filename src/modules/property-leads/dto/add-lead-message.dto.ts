import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class AddLeadMessageDto {
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message: string;
}
