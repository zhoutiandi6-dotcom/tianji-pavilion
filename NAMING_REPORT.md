# NAMING_REPORT.md

## API Naming Audit

---

## Route Naming Consistency

| Controller | Route | Plural? | RESTful? | Status |
|-----------|-------|---------|----------|--------|
| TasksController | /tasks | ✅ | ✅ | ✅ |
| UsersController | /users | ✅ | ✅ | ✅ |
| StoresController | /stores | ✅ | ✅ | ✅ |
| RequirementTypesController | /requirement-types | ✅ | ✅ | ✅ |
| ImageTasksController | /image-tasks | ✅ | ✅ | ✅ |
| NotificationsController | /notifications | ✅ | ✅ | ✅ |
| AttachmentsController | /attachments | ✅ | ✅ | ✅ |
| OperationLogController | /operation-logs | ✅ | ✅ | ✅ |
| RolesPermissionsController | /roles-permissions | ✅ | ✅ | ✅ |
| AnnouncementController | /announcements | ✅ | ✅ | ✅ |
| ApprovalController | /tasks/:taskId/approval | ❌ | ❌ | Plural missing |
| AuditController | /audit | ❌ | ⚠️ | Uncountable noun |
| SystemConfigController | /system-config | ❌ | ⚠️ | Config is uncountable |
| DashboardController | /dashboard | ❌ | ⚠️ | Domain concept |
| TimelineController | /timeline | ❌ | ⚠️ | Domain concept |
| HealthController | /health | ❌ | ✅ | Acceptable |
| AuthController | /auth | ❌ | ✅ | Acceptable |

## P1 Findings

### NAM-01: Approval Route Not Plural

| 字段 | 内容 |
|------|------|
| **Current** | /api/tasks/:taskId/approval |
| **Expected** | /api/tasks/:taskId/approvals |

### NAM-02: Timeline Route Should Be Nested Under Tasks

| 字段 | 内容 |
|------|------|
| **Current** | /api/timeline/task/:taskId |
| **Expected** | /api/tasks/:taskId/timeline |

## P2 Findings

### NAM-03: Method Names Use Different Conventions

| 字段 | 内容 |
|------|------|
| **Good** | indAll(), indOne(), create(), update(), emove() |
| **Inconsistent** | nnouncement.service.ts uses 	ogglePin(), nnouncement.controller.ts uses 	oggle-pin |

### NAM-04: DTO Naming Convention

| 字段 | 内容 |
|------|------|
| **Pattern** | {Verb}{Entity}Dto (e.g., CreateTaskDto) |
| **Consistent?** | ✅ |
