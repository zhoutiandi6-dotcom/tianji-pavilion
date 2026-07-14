import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsPositive } from "class-validator";

export class BatchAssignImageTasksDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  imageTaskIds!: number[];

  @IsInt()
  @IsPositive()
  designerId!: number;
}
