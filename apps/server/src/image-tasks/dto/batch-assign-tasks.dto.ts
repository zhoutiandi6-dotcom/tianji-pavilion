import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, Min } from "class-validator";

export class BatchAssignTasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  taskIds!: number[];

  @IsInt()
  @Min(1)
  designerId!: number;

  @IsIn(["ASSIGN", "REASSIGN"])
  mode!: "ASSIGN" | "REASSIGN";
}
