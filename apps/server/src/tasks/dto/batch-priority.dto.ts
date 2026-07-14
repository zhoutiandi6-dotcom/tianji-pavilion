import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsInt } from "class-validator";

export class BatchPriorityDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  taskIds!: number[];

  @IsIn(["URGENT", "NORMAL"])
  priority!: "URGENT" | "NORMAL";
}
