import { IsDateString } from "class-validator";

export class InitializeWeeklyOperationsApprovalPlanDto {
  @IsDateString()
  weekStart!: string;
}
