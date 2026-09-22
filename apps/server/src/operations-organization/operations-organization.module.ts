import { Module } from "@nestjs/common";
import { OperationsOrganizationService } from "./operations-organization.service";

@Module({
  providers: [OperationsOrganizationService],
  exports: [OperationsOrganizationService],
})
export class OperationsOrganizationModule {}
