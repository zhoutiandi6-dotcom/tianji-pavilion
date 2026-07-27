import { IsDateString, IsOptional } from "class-validator";

export class WeeklyOperationsApprovalPlanQueryDto {
  @IsOptional()
  @IsDateString()
  weekStart?: string;
}
