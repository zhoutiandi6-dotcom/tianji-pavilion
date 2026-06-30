import { IsString, IsOptional, MinLength } from "class-validator";

export class CreateStoreDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
