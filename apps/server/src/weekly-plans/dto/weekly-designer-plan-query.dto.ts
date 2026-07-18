import { IsDateString, IsOptional } from "class-validator";

export class WeeklyDesignerPlanQueryDto {
  @IsOptional()
  @IsDateString()
  weekStart?: string;
}
