import { IsOptional, IsString, IsInt, IsEmail, MinLength } from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  roleId?: number;

  @IsOptional()
  isActive?: boolean;
}
