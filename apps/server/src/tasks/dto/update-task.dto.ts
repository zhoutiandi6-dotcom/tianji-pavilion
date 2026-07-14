import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateTaskDto {
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsInt() storeId?: number | null;
  @IsOptional() @IsInt() requirementTypeId?: number | null;
  @IsOptional() @IsString() compatibleProduct?: string;
  @IsOptional() @IsString() requesterName?: string;
  @IsOptional() @IsString() operatorOwner?: string;
  @IsOptional() @IsString() submittedAt?: string | null;
  @IsOptional() @IsString() deadline?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(200) imageCount?: number;
  @IsOptional() @IsString() imageSize?: string;
  @IsOptional() @IsString() usagePosition?: string;
  @IsOptional() @IsString() taskType?: string;
  @IsOptional() @IsString() overallRequirementType?: string;
  @IsOptional() @IsString() unifiedModificationNote?: string;
  @IsOptional() @IsString() outputSpec?: string;
  @IsOptional() @IsString() materialLinks?: string;
  @IsOptional() @IsBoolean() urgent?: boolean;
}
