import { Controller, Post, Get, Body, UseGuards, Request, Ip } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsString() @MinLength(1) username!: string;
  @IsString() @MinLength(1) password!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) oldPassword!: string;
  @IsString() @MinLength(6) newPassword!: string;
}

export class InitOwnerDto {
  @IsString() @MinLength(3) username!: string;
  @IsString() @MinLength(6) password!: string;
  @IsString() @MinLength(1) displayName!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login")
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto.username, dto.password, ip);
  }

  @UseGuards(AuthGuard("jwt"))
  @Get("me")
  async getProfile(@Request() req: any) {
    return this.authService.getCurrentUser(req.user.sub);
  }

  @UseGuards(AuthGuard("jwt"))
  @Post("change-password")
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, dto.oldPassword, dto.newPassword);
  }

  // Milestone A: System initialization
  @Get("init-status")
  async initStatus() {
    return this.authService.isInitialized();
  }

  @Post("init")
  async initOwner(@Body() dto: InitOwnerDto) {
    return this.authService.initOwner(dto.username, dto.password, dto.displayName);
  }
}
