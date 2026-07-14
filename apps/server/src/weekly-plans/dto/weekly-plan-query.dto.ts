import { IsIn, IsInt, IsOptional, IsPositive } from "class-validator";
import { WEEKLY_PLAN_ITEM_SOURCE, WEEKLY_PLAN_ITEM_STATUS } from "../weekly-plan.constants";

export class WeeklyPlanItemsQueryDto {
  @IsOptional() @IsInt() @IsPositive() designerId?: number;
  @IsOptional() @IsIn(Object.values(WEEKLY_PLAN_ITEM_SOURCE)) source?: string;
  @IsOptional() @IsIn(Object.values(WEEKLY_PLAN_ITEM_STATUS)) status?: string;
  @IsOptional() @IsInt() @IsPositive() requirementType?: number;
  @IsOptional() @IsInt() @IsPositive() page?: number;
  @IsOptional() @IsInt() @IsPositive() pageSize?: number;
}
