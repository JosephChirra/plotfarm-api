import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ReportResolutionAction, ReportStatus } from '@prisma/client';

export class ReviewReportDto {
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @IsOptional()
  @IsEnum(ReportResolutionAction)
  action?: ReportResolutionAction;

  @IsOptional()
  @IsInt()
  @Min(1)
  suspensionDays?: number;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}
