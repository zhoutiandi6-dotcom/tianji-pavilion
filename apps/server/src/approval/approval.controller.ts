import { Controller, Post, Get, Param, Body, UseGuards, Request, ParseIntPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApprovalService } from "./approval.service";
import { PrismaService } from "../common/prisma.service";

@UseGuards(AuthGuard("jwt"))
@Controller("tasks/:taskId/approval")
export class ApprovalController {
  constructor(private service: ApprovalService, private prisma: PrismaService) {}
  @Post("submit") async submit(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) { return this.service.submit(taskId, req.user.sub, req.user.role); }
  @Post("withdraw") async withdraw(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) { return this.service.withdraw(taskId, req.user.sub, req.user.role); }
  @Post("approve") async approve(@Param("taskId", ParseIntPipe) taskId: number, @Body("comment") comment: string, @Request() req: any) { return this.service.approve(taskId, req.user.sub, req.user.role, comment); }
  @Post("rollback") async rollback(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) { return this.service.rollback(taskId, req.user.sub, req.user.role); }
  @Post("reject") async reject(@Param("taskId", ParseIntPipe) taskId: number, @Body("comment") comment: string, @Request() req: any) { return this.service.reject(taskId, req.user.sub, req.user.role, comment); }
  @Get("records") async records(@Param("taskId", ParseIntPipe) taskId: number) { return this.prisma.approvalRecord.findMany({ where: { taskId }, include: { approver: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "desc" } }); }
}
