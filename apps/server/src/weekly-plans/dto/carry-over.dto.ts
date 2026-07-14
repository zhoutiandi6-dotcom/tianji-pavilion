import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsPositive } from "class-validator";

export class CarryOverWeeklyPlanItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  imageTaskIds!: number[];
}
