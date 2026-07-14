import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";

export class UpdateImageTaskDto {
  @IsOptional() @IsString() imageTitle?: string;
  @IsOptional() @IsString() imageType?: string;
  @IsOptional() @IsString() requirementType?: string;
  @IsOptional() @IsString() originalImageUrl?: string;
  @IsOptional() @IsString() referenceImageUrl?: string;
  @IsOptional() @IsString() requirement?: string;
  @IsOptional() @IsBoolean() useUnifiedRequirement?: boolean;
  @IsOptional() @IsInt() inheritFromImageIndex?: number | null;
  @IsOptional() @IsInt() designerId?: number | null;
  @IsOptional() @IsBoolean() includeInWeeklyPlan?: boolean;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsString() completedAttachmentUrl?: string;
  @IsOptional() @IsString() designNote?: string;
  @IsOptional() @IsString() reviewStatus?: string;
  @IsOptional() @IsString() reviewRemark?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}
