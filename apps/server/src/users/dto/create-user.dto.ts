import { IsString, IsOptional, IsInt, IsEmail, MinLength } from "class-validator";

export class CreateUserDto {
  @IsOptional() isActive?: boolean;
  @IsString() @MinLength(1) username!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() @MinLength(1) displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsInt() roleId?: number;
  @IsOptional() @IsString() roleName?: string;
}
