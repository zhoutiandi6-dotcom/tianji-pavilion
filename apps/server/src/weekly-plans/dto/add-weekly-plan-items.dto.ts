import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsPositive } from "class-validator";

export class AddWeeklyPlanItemDto {
  @IsInt()
  @IsPositive()
  imageTaskId!: number;
}

export class AddWeeklyPlanItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  imageTaskIds!: number[];
}

export class ActivateWeeklyPlanDto {
  @IsOptional()
  @IsBoolean()
  allowEmpty?: boolean;
}
