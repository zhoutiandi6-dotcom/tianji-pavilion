import { IsString, IsOptional, IsInt, IsEmail, MinLength } from "class-validator";

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsInt()
  roleId!: number;
}
