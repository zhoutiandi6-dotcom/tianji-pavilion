import { Global, Module } from "@nestjs/common";
import { OperationLogService } from "./operation-log.service";
import { OperationLogController } from "./operation-log.controller";

@Global()
@Module({
  controllers: [OperationLogController],
  providers: [OperationLogService],
  exports: [OperationLogService],
})
export class OperationLogModule {}
