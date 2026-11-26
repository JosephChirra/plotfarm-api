import { IsEnum, IsUUID } from 'class-validator';
import { ReportTargetType } from '@prisma/client';

export class CheckReportQueryDto {
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @IsUUID()
  targetId: string;
}
