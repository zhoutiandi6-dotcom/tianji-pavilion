import { Body, Controller, ForbiddenException, Get, Param, Put, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsOptional, IsString } from "class-validator";
import { SystemConfigService } from "./system-config.service";

export class UpdateSystemConfigDto {
  @IsOptional()
  values?: Record<string, string>;

  @IsOptional()
  @IsString()
  changeReason?: string;
}

@UseGuards(AuthGuard("jwt"))
@Controller("system-config")
export class SystemConfigController {
  constructor(private service: SystemConfigService) {}

  private checkPermission(role: string) {
    if (role !== "SUPER_ADMIN" && role !== "OWNER") {
      throw new ForbiddenException("仅管理员可管理系统设置");
    }
  }

  @Get()
  async findAll(@Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.findAll();
  }

  @Put()
  async update(@Body() body: UpdateSystemConfigDto, @Request() req: any) {
    this.checkPermission(req.user.role);
    const values = body.values || body;
    const reason = body.changeReason;
    return this.service.updateBatch(values as Record<string, string>, req.user.sub, reason);
  }

  @Get(":key/history")
  async getHistory(@Param("key") key: string, @Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.getHistory(key);
  }
}
