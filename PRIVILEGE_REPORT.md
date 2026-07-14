# PRIVILEGE_REPORT.md

## Privilege Escalation Report

---

## Owner Protection

| Check | Status |
|-------|--------|
| Owner 不能禁用 | ✅ users.service.ts:deactivate(): if (u.role.name === "OWNER") throw ForbiddenException |
| Owner 不能降级 | ✅ users.service.ts:update(): if (u.role.name === "OWNER" && dto.roleId !== u.roleId) |
| Owner 不能删除 | ✅ users.controller: checkPermission 限制只有 OWNER/SUPER_ADMIN 可管理用户 |
| 仅 Owner 可创建 Owner | ✅ users.service.ts:create(): if (dto.roleName === "OWNER") throw ForbiddenException |

## Role Escalation

| Risk | Status |
|------|--------|
| 设计师提权为自己+1级 | ✅ 用户管理仅 OWNER/SUPER_ADMIN |
| 运营越权审批 | ✅ WorkflowEngine 校验 userRole |
| Guest 越权访问 | ✅ isActive=false 的用户被 auth.service.ts:login() 拦截 |

## Confirmed Issues

### PRIV-01: Approval Records — No Role Restriction

**Risk**: 任何登录用户均可查看审批记录
**File**: pps/server/src/approval/approval.controller.ts:16
**Suggested Fix**: 添加角色校验 — 仅 OWNER/SUPER_ADMIN/OPERATION_MANAGER 可查看

## Verdict

No privilege escalation paths found beyond the IDOR issues already reported.
The Owner protection model is correctly implemented.
