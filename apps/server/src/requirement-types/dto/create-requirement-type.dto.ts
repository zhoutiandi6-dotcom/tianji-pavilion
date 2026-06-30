import { IsString, IsOptional, IsInt } from "class-validator";

export class CreateRequirementTypeDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
