import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class CreateTaskImageTaskDto {
  @IsOptional() @IsString() imageTitle?: string;
  @IsOptional() @IsString() requirementType?: string;
  @IsOptional() @IsString() requirement?: string;
}

export class CreateTaskDto {
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsInt() storeId?: number;
  @IsOptional() @IsInt() requirementTypeId?: number;
  @IsOptional() @IsString() compatibleProduct?: string;
  @IsOptional() @IsString() requesterName?: string;
  @IsOptional() @IsString() operatorOwner?: string;
  @IsOptional() @IsString() submittedAt?: string;
  @IsOptional() @IsString() deadline?: string;
  @IsOptional() @IsInt() @Min(1) @Max(200) imageCount?: number;
  @IsOptional() @IsString() imageSize?: string;
  @IsOptional() @IsString() usagePosition?: string;
  @IsOptional() @IsString() taskType?: string;
  @IsOptional() @IsString() overallRequirementType?: string;
  @IsOptional() @IsString() unifiedModificationNote?: string;
  @IsOptional() @IsString() outputSpec?: string;
  @IsOptional() @IsString() materialLinks?: string;
  @IsOptional() @IsBoolean() urgent?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateTaskImageTaskDto)
  imageTasks?: CreateTaskImageTaskDto[];
}
