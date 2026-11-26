import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum LeadStatusEnum {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  NEGOTIATION = 'NEGOTIATION',
  CLOSED = 'CLOSED',
}

export class UpdatePropertyLeadDto {
  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsEnum(LeadStatusEnum)
  @IsOptional()
  status?: LeadStatusEnum;
}
