import { ForbiddenException } from "@nestjs/common";
import { OperationsOrganizationController } from "./operations-organization.controller";

describe("OperationsOrganizationController", () => {
  it("returns 403 to an operations manager that calls a write endpoint directly", async () => {
    const organization: any = { createGroup: jest.fn() };
    const visibility: any = {
      subjectForUser: jest.fn().mockResolvedValue({ userId: 2, role: "OPERATION_MANAGER" }),
      hasCapability: jest.fn((_: any, capability: string) => capability === "ORG_VIEW"),
    };
    const controller = new OperationsOrganizationController(organization, visibility);
    await expect(controller.createGroup({ name: "组 C" }, { user: { role: "OPERATION_MANAGER", sub: 2 } })).rejects.toBeInstanceOf(ForbiddenException);
    expect(organization.createGroup).not.toHaveBeenCalled();
  });

  it("does not let a group leader read another group's member list", async () => {
    const organization: any = { getGroupDetail: jest.fn() };
    const visibility: any = {
      subjectForUser: jest.fn().mockResolvedValue({ userId: 7, role: "OPERATION", membershipRole: "GROUP_LEADER", groupId: 1 }),
      hasCapability: jest.fn().mockReturnValue(false),
    };
    const controller = new OperationsOrganizationController(organization, visibility);
    await expect(controller.members(2, { user: { role: "OPERATION", sub: 7 } })).rejects.toBeInstanceOf(ForbiddenException);
    expect(organization.getGroupDetail).not.toHaveBeenCalled();
  });
});
