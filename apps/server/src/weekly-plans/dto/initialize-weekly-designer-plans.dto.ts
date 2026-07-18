import { IsDateString } from "class-validator";

export class InitializeWeeklyDesignerPlansDto {
  @IsDateString()
  weekStart!: string;
}
