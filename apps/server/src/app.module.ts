import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule } from "./common/config.module";
import { PrismaModule } from "./common/prisma.module";
import { OperationLogModule } from "./operation-log/operation-log.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { RolesPermissionsModule } from "./roles-permissions/roles-permissions.module";
import { TasksModule } from "./tasks/tasks.module";
import { StoresModule } from "./stores/stores.module";
import { RequirementTypesModule } from "./requirement-types/requirement-types.module";
import { ImageTasksModule } from "./image-tasks/image-tasks.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { ApprovalModule } from "./approval/approval.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { HealthModule } from "./health/health.module";
import { SystemConfigModule } from "./system-config/system-config.module";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { FeedbackModule } from "./feedback/feedback.module";
import { EventBusModule } from "./event-bus/event-bus.module";
import { WorkflowEngineModule } from "./workflow-engine/workflow-engine.module";
import { AnnouncementModule } from "./announcement/announcement.module";
import { WorkflowNotificationModule } from "./workflow-notification/workflow-notification.module";
import { WorkflowHistoryModule } from "./workflow-history/workflow-history.module";
import { AuditModule } from "./audit/audit.module";
import { TimelineModule } from "./timeline/timeline.module";

@Module({
  imports: [
    ConfigModule, PrismaModule, OperationLogModule,
    AuthModule, UsersModule, RolesPermissionsModule,
    TasksModule, StoresModule, RequirementTypesModule,
    ImageTasksModule, AttachmentsModule, DashboardModule,
    ApprovalModule, NotificationsModule, HealthModule,
    SystemConfigModule, FeedbackModule,
    // Infrastructure modules
    EventBusModule, WorkflowEngineModule,
    AnnouncementModule, WorkflowNotificationModule,
    // RFC-008 modules
    WorkflowHistoryModule, AuditModule, TimelineModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

