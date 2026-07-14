import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsOptional, IsPositive } from "class-validator";

export class BatchAssignImageTasksDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  imageTaskIds!: number[];

  @IsInt()
  @IsPositive()
  designerId!: number;

  @IsOptional()
  @IsBoolean()
  includeInWeeklyPlan?: boolean;
}
