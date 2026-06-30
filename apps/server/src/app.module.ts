import { Module } from "@nestjs/common";
import { ConfigModule } from "./common/config.module";
import { PrismaModule } from "./common/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { RolesPermissionsModule } from "./roles-permissions/roles-permissions.module";
import { TasksModule } from "./tasks/tasks.module";
import { StoresModule } from "./stores/stores.module";
import { RequirementTypesModule } from "./requirement-types/requirement-types.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesPermissionsModule,
    TasksModule,
    StoresModule,
    RequirementTypesModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class AppModule {}
