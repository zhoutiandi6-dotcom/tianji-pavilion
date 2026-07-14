# CONTROLLER_REPORT.md

## Controller Quality Audit

---

## Controller Overview (17 Controllers, 65 Endpoints)

| # | Controller | Prefix | Endpoints | RESTful? |
|---|-----------|--------|-----------|----------|
| 1 | AuthController | /auth | 5 | ⚠️ Non-REST (login/init are RPC-style) |
| 2 | UsersController | /users | 8 | ✅ REST + custom actions |
| 3 | TasksController | /tasks | 5 | ✅ REST |
| 4 | ImageTasksController | /image-tasks | 9 | ✅ REST |
| 5 | ApprovalController | /tasks/:taskId/approval | 5 | ⚠️ Nested without 's' |
| 6 | StoresController | /stores | 5 | ✅ REST |
| 7 | RequirementTypesController | /requirement-types | 5 | ✅ REST |
| 8 | AnnouncementController | /announcements | 7 | ✅ REST |
| 9 | NotificationsController | /notifications | 4 | ✅ REST |
| 10 | SystemConfigController | /system-config | 3 | ⚠️ Singular |
| 11 | AuditController | /audit | 2 | ⚠️ Singular |
| 12 | TimelineController | /timeline | 1 | ⚠️ Non-standard path 	ask/:taskId |
| 13 | DashboardController | /dashboard | 1 | ✅ |
| 14 | HealthController | /health | 1 | ✅ |
| 15 | OperationLogController | /operation-logs | 1 | ✅ |
| 16 | RolesPermissionsController | /roles-permissions | 2 | ✅ |
| 17 | AttachmentsController | /attachments | 1 | ✅ |

## P1 Findings

### CTRL-01: Approval Controller Route Naming

| 字段 | 内容 |
|------|------|
| **File** | pproval.controller.ts |
| **Route** | @Controller('tasks/:taskId/approval') |
| **Issue** | 资源名 pproval 应为复数 pprovals |
| **Suggested Fix** | 改为 @Controller('tasks/:taskId/approvals') |

### CTRL-02: SystemConfig and Audit Use Singular

| 字段 | 内容 |
|------|------|
| **File** | system-config.controller.ts, udit.controller.ts |
| **Route** | @Controller('system-config'), @Controller('audit') |
| **Issue** | RESTful 惯例应使用复数 |
| **Mitigation** | 这些属于不可数名词/系统概念，可接受 |

### CTRL-03: Timeline Route Missing Parent Resource

| 字段 | 内容 |
|------|------|
| **File** | 	imeline.controller.ts |
| **Route** | /api/timeline/task/:taskId |
| **Issue** | 应改为 /api/tasks/:taskId/timeline 以保持与任务资源的一致性 |
| **Suggested Fix** | 改为 @Controller('/tasks/:taskId/timeline') |

## P2 Findings

### CTRL-04: No Return Type Annotations

| 字段 | 内容 |
|------|------|
| **Files** | All 17 controllers |
| **Issue** | 所有 Controller 方法的返回类型未标注（均为隐式 Promise<any>） |
| **Suggested Fix** | 添加 : Promise<ApiResponse<T>> 返回类型 |

### CTRL-05: QueryTaskDto Defined But Unused

| 字段 | 内容 |
|------|------|
| **File** | 	asks/dto/query-task.dto.ts |
| **Evidence** | DTO 已定义但 TasksController.findAll() 直接使用 @Query() 原始参数 |
| **Suggested Fix** | 将 Controller 参数类型改为 @Query() dto: QueryTaskDto |
