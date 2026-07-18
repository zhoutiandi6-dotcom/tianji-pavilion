import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsInt, IsOptional, IsPositive } from "class-validator";

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
  @IsDateString()
  weekStart?: string;
}
