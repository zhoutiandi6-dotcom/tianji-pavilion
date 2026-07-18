import { IsDateString, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from "class-validator";

export class UpsertWeeklyDesignerPlanDto {
  @IsInt()
  @Min(1)
  designerId!: number;

  @IsInt()
  @Min(0)
  @Max(9999)
  targetImageCount!: number;

  @IsDateString()
  weekStart!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
