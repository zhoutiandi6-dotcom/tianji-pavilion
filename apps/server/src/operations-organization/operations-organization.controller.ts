import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { OperationsOrganizationService } from "./operations-organization.service";

@UseGuards(AuthGuard("jwt"))
@Controller("operations-organization")
export class OperationsOrganizationController {
  constructor(private readonly organization: OperationsOrganizationService, private readonly visibility: TaskVisibilityService) {}

  private async subject(req: any) { return this.visibility.subjectForUser(req.user.role, req.user.sub); }
  private async requireManage(req: any) {
    if (!this.visibility.hasCapability(await this.subject(req), "ORG_MANAGE")) throw new ForbiddenException("仅管理员可管理运营组织");
  }
  private async requireView(req: any) {
    const subject = await this.subject(req);
    if (this.visibility.hasCapability(subject, "ORG_VIEW") || subject.membershipRole === "GROUP_LEADER") return subject;
    throw new ForbiddenException("无运营组织查看权限");
  }
  private async requireGroupReadable(req: any, groupId: number) {
    const subject = await this.requireView(req);
    if (subject.membershipRole === "GROUP_LEADER" && subject.groupId !== groupId) throw new ForbiddenException("运营组长只能查看本组成员");
  }

  @Get("groups") async groups(@Request() req: any) { const subject = await this.requireView(req); return subject.membershipRole === "GROUP_LEADER" ? [await this.organization.getGroupDetail(subject.groupId!)] : this.organization.listGroups(); }
  @Get("unassigned-operations") async unassigned(@Request() req: any) { const subject = await this.requireView(req); if (subject.membershipRole === "GROUP_LEADER") throw new ForbiddenException("运营组长只能查看本组成员"); return this.organization.getUnassignedOperations(); }
  @Get("readiness") async readiness(@Request() req: any) { await this.requireManage(req); return this.organization.getReadiness(); }
  @Get("audit") async audit(@Request() req: any) { await this.requireManage(req); return this.organization.listAudit(); }
  @Get("groups/:groupId") async detail(@Param("groupId", ParseIntPipe) groupId: number, @Request() req: any) { await this.requireGroupReadable(req, groupId); return this.organization.getGroupDetail(groupId); }
  @Get("groups/:groupId/members") async members(@Param("groupId", ParseIntPipe) groupId: number, @Request() req: any) { await this.requireGroupReadable(req, groupId); return (await this.organization.getGroupDetail(groupId)).memberships; }

  @Post("groups") async createGroup(@Body() body: any, @Request() req: any) { await this.requireManage(req); return this.organization.createGroup(String(body.name || ""), req.user.sub); }
  @Patch("groups/:groupId") async updateGroup(@Param("groupId", ParseIntPipe) groupId: number, @Body() body: any, @Request() req: any) {
    await this.requireManage(req);
    if (body.status === "INACTIVE") return this.organization.deactivateGroup(groupId, req.user.sub);
    return this.organization.renameGroup(groupId, String(body.name || ""), req.user.sub);
  }
  @Post("memberships") async assign(@Body() body: any, @Request() req: any) { await this.requireManage(req); return this.organization.assignMembership({ userId: Number(body.userId), groupId: Number(body.groupId), memberRole: "MEMBER", actorId: req.user.sub, reason: body.reason }); }
  @Post("memberships/move") async move(@Body() body: any, @Request() req: any) { await this.requireManage(req); return this.organization.moveMembership({ userId: Number(body.userId), groupId: Number(body.groupId), memberRole: "MEMBER", actorId: req.user.sub, reason: String(body.reason || "") }); }
  @Post("memberships/end") async end(@Body() body: any, @Request() req: any) { await this.requireManage(req); return this.organization.endActiveMembership(Number(body.userId), req.user.sub, String(body.reason || "")); }
  @Post("groups/:groupId/leader/appoint") async appoint(@Param("groupId", ParseIntPipe) groupId: number, @Body() body: any, @Request() req: any) { await this.requireManage(req); return this.organization.appointLeader(groupId, Number(body.userId), req.user.sub, body.reason); }
  @Post("groups/:groupId/leader/replace") async replace(@Param("groupId", ParseIntPipe) groupId: number, @Body() body: any, @Request() req: any) { await this.requireManage(req); return this.organization.replaceLeader(groupId, Number(body.userId), req.user.sub, body.keepPreviousMember !== false, body.reason); }
  @Post("groups/:groupId/leader/revoke") async revoke(@Param("groupId", ParseIntPipe) groupId: number, @Body() body: any, @Request() req: any) { await this.requireManage(req); return this.organization.revokeLeader(groupId, req.user.sub, body.reason); }
}
