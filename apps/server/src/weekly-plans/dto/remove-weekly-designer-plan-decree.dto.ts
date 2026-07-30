import { IsDateString, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class RemoveWeeklyDesignerPlanDecreeDto {
  @IsDateString()
  weekStart!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
