import { Controller, ForbiddenException, Get, Param, ParseIntPipe, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuditEventService } from "./services/audit-event.service";

@UseGuards(AuthGuard("jwt"))
@Controller("audit")
export class AuditController {
  constructor(private service: AuditEventService) {}

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

  @Get(":resourceType/:resourceId")
  async findByResource(
    @Param("resourceType") resourceType: string,
    @Param("resourceId", ParseIntPipe) resourceId: number,
    @Request() req: any,
  ) {
    this.checkPermission(req.user.role);
    return this.service.findByResource(resourceType, resourceId);
  }
}
