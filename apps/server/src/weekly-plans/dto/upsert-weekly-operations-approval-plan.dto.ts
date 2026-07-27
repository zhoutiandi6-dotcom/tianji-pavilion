import { IsDateString, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from "class-validator";

export class UpsertWeeklyOperationsApprovalPlanDto {
  @IsInt()
  @Min(0)
  @Max(999999)
  targetImageCount!: number;

  @IsDateString()
  weekStart!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
