import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CreateImageTaskDto {
  @IsInt() taskId!: number;
  @IsString() @MinLength(1) imageTitle!: string;
  @IsOptional() @IsString() imageType?: string;
  @IsOptional() @IsString() requirementType?: string;
  @IsOptional() @IsString() originalImageUrl?: string;
  @IsOptional() @IsString() referenceImageUrl?: string;
  @IsOptional() @IsString() requirement?: string;
  @IsOptional() @IsBoolean() useUnifiedRequirement?: boolean;
  @IsOptional() @IsInt() inheritFromImageIndex?: number;
  @IsOptional() @IsInt() designerId?: number;
  @IsOptional() @IsString() remark?: string;
}
