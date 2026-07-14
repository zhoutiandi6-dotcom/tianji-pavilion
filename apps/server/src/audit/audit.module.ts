import { Module } from "@nestjs/common";
import { AuditEventService } from "./services/audit-event.service";
import { AuditController } from "./audit.controller";

@Module({
  controllers: [AuditController],
  providers: [AuditEventService],
  exports: [AuditEventService],
})
export class AuditModule {}
