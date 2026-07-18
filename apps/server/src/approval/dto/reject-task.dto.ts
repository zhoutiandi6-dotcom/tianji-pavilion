import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength } from "class-validator";

export class RejectTaskDto {
  @IsString()
  @MaxLength(2000)
  comment!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  issueImageTaskIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  issueTypes?: string[];
}
