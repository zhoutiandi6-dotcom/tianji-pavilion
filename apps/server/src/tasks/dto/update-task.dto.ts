import { IsOptional, IsString, IsEnum, IsInt, IsBoolean, MinLength } from "class-validator";

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  productCode?: string;

  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;

  @IsOptional()
  @IsEnum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
  status?: string;

  @IsOptional()
  @IsEnum(["LOW", "MEDIUM", "HIGH", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsInt()
  assigneeId?: number | null;

  @IsOptional()
  @IsInt()
  storeId?: number | null;
}
