import { Global, Module } from "@nestjs/common";
import { OperationsOrganizationService } from "./operations-organization.service";
import { OperationsApprovalRoutingService } from "./operations-approval-routing.service";
import { OperationsOrganizationController } from "./operations-organization.controller";
import { TaskVisibilityService } from "../common/task-visibility.service";

@Global()
@Module({
  controllers: [OperationsOrganizationController],
  providers: [OperationsOrganizationService, OperationsApprovalRoutingService, TaskVisibilityService],
  exports: [OperationsOrganizationService, OperationsApprovalRoutingService],
})
export class OperationsOrganizationModule {}
