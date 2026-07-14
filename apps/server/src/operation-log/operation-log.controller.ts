import { Controller, ForbiddenException, Get, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { OperationLogService } from "./operation-log.service";

@UseGuards(AuthGuard("jwt"))
@Controller("operation-logs")
export class OperationLogController {
  constructor(private service: OperationLogService) {}

  private checkPermission(role: string) {
    if (!["OWNER", "SUPER_ADMIN"].includes(role)) {
      throw new ForbiddenException("当前账号无权限访问该页面。");
    }
  }

  @Get()
  async findAll(@Query("page") page = 1, @Query("pageSize") pageSize = 50, @Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.findAll(Number(page), Number(pageSize));
  }
}
