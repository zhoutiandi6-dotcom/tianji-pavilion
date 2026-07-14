# GUARD_REPORT.md

## Guard Review

---

## Guards Found

| # | Guard Name | File | Type | Used? |
|---|------------|------|------|-------|
| 1 | AuthGuard('jwt') | (passport-jwt) | Authentication | ✅ 16/17 controllers |
| 2 | RolesGuard | common/roles.guard.ts | Authorization | ❌ **Defined but never used** |

## AuthGuard('jwt') Coverage

| Controller | Guard Status | Notes |
|------------|-------------|-------|
| AuthController | ✅ Partial | login/init-status/init = public (by design) |
| UsersController | ✅ | + custom checkPermission() |
| TasksController | ✅ | + role checks in service |
| ImageTasksController | ✅ | + role checks in service |
| ApprovalController | ✅ | + role checks in service |
| AnnouncementController | ✅ | + role checks in service |
| StoresController | ✅ | |
| RequirementTypesController | ✅ | |
| NotificationsController | ✅ | |
| SystemConfigController | ✅ | + custom checkPermission() |
| AuditController | ✅ | |
| TimelineController | ✅ | |
| RolesPermissionsController | ✅ | |
| OperationLogController | ✅ | |
| DashboardController | ✅ | |
| AttachmentsController | ✅ | |
| HealthController | ❌ **Public** | Intentionally public |

## RolesGuard Status

RolesGuard is defined in common/roles.guard.ts and implements CanActivate.
However, no controller uses the @Roles() decorator, so the guard is never triggered.

**Impact**: Low — AuthGuard catches unauthenticated requests. Role checks are done inline in services/controllers.
**Recommendation**: Migrate role checks to @Roles() decorator pattern for consistency.

## Key Finding

All controllers have at minimum AuthGuard('jwt'). No unauthenticated controller endpoint exists
except those intentionally public (health, login, init-status, init).
