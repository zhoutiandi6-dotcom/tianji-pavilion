import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApprovalService } from "./approval.service";
import { RejectTaskDto } from "./dto/reject-task.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("tasks/:taskId/approval")
export class ApprovalController {
  constructor(private service: ApprovalService) {}

  @Post("submit")
  submit(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) {
    return this.service.submit(taskId, req.user.sub, req.user.role);
  }

  @Post("withdraw")
  withdraw(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) {
    return this.service.withdraw(taskId, req.user.sub, req.user.role);
  }

  @Post("approve")
  approve(@Param("taskId", ParseIntPipe) taskId: number, @Body("comment") comment: string, @Request() req: any) {
    return this.service.approve(taskId, req.user.sub, req.user.role, comment);
  }

  @Post("rollback")
  rollback(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) {
    return this.service.rollback(taskId, req.user.sub, req.user.role);
  }

  @Post("reject")
  reject(@Param("taskId", ParseIntPipe) taskId: number, @Body() dto: RejectTaskDto, @Request() req: any) {
    return this.service.reject(taskId, req.user.sub, req.user.role, dto);
  }

  @Get("records")
  records(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) {
    return this.service.records(taskId, req.user.role, Number(req.user.sub));
  }
}
