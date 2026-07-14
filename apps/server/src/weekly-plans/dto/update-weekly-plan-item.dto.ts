import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CancelWeeklyPlanItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  cancelReason!: string;
}

export class RestoreWeeklyPlanItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
