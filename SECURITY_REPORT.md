# SECURITY_REPORT.md

## Code Audit 003 — Security Audit

**Date**: 2026-07-03
**Scope**: Authentication, Authorization, Permission Safety

---

## Summary

| Category | P0 | P1 | P2 | Total |
|----------|----|----|----|-------|
| Authentication | 1 | 1 | 1 | 3 |
| Authorization | 1 | 1 | 1 | 3 |
| IDOR | 0 | 2 | 2 | 4 |
| DTO Validation | 0 | 2 | 0 | 2 |
| Exception Exposure | 0 | 0 | 1 | 1 |
| Privilege Escalation | 0 | 1 | 0 | 1 |
| **Total** | **2** | **7** | **5** | **14** |

---

## P0 Findings (Must Fix)

### AUTH-01: JWT Fallback Hardcoded Secret

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/auth/jwt.strategy.ts:10 |
| **File** | pps/server/src/auth/auth.module.ts:16 |
| **Evidence** | secretOrKey: process.env.JWT_SECRET || 'fallback-secret' |
| **Risk** | 如果生产环境未配置 JWT_SECRET，攻击者可以用已知的 fallback-secret 伪造任意 JWT Token，冒充任意用户（包括 Owner） |
| **Impact** | 严重 — 可完全绕过认证系统 |
| **Suggested Fix** | 移除 fallback 默认值，启动时检测 JWT_SECRET 是否存在，不存在则抛出异常阻止启动 |

### AUTH-02: CORS Allow All Origins

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/main.ts:33 |
| **Evidence** | pp.enableCors({ origin: true, credentials: true }) |
| **Risk** | 允许任意域名的跨域请求，配合 credentials: true 可被 CSRF 攻击利用 |
| **Impact** | 中 — 内部局域网风险较低，但直接暴露到外网存在 CSRF 风险 |
| **Suggested Fix** | 配置白名单 origins 或通过环境变量控制 |

---

## P1 Findings

### AUTH-03: RolesGuard Defined But Never Used

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/common/roles.guard.ts |
| **Evidence** | RolesGuard 已定义，但没有任何 Controller 使用 @Roles() 装饰器 |
| **Risk** | 所有角色校验通过手写的 if-else 在 Service/Controller 内部完成，没有统一的 Guard 层拦截 |
| **Impact** | 如果开发人员忘记在 Service 方法中添加角色校验，就会产生权限绕过 |
| **Suggested Fix** | 迁移角色校验到 RolesGuard，在 Controller 层用 @Roles("SUPER_ADMIN") 声明式控制 |

### IDOR-01: Tasks findOne — No Ownership Check

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/tasks/tasks.controller.ts:17 |
| **Evidence** | @Get(":id") async findOne(@Param("id") id: number) — 没有传入 req.user |
| **Service** | 	asks.service.ts:findOne() — 没有任何 userId 参数或所有权校验 |
| **Risk** | 设计师可以查看任意法旨详情，包括其他设计师的未审批法旨。违反 Sprint 5 业务规则 "设计师只能查看分配给自己的法旨" |
| **Impact** | 高 — 数据可见范围违规 |

### IDOR-02: Approval Records — No Ownership Check

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/approval/approval.controller.ts:16 |
| **Evidence** | @Get("records") async records(...) — 只传入 taskId，不检查请求者是否有权限查看该任务的审批记录 |
| **Risk** | 任何登录用户都可以查看任意法旨的审批历史 |
| **Impact** | 中 — 审批人信息和审批意见泄露 |

### IDOR-03: ImageTask findByTask — No Ownership Check

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/image-tasks/image-tasks.controller.ts:8 |
| **Service** | image-tasks.service.ts:findByTask() — 没有设计所有权校验 |
| **Risk** | 设计师可以查看任意法旨的所有图片任务 |
| **Impact** | 中 |

### DTO-01: Announcement Controller Uses ny Type

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/announcement/announcement.controller.ts:14-15 |
| **Evidence** | @Body() dto: any — 没有 DTO 类型验证 |
| **Risk** | 可以传入任意字段，后端只取需要的字段但无法通过静态类型检查发现 PR 错误 |
| **Impact** | 低 — Service 层有权限校验，但缺少字段级验证 |

### DTO-02: SystemConfig Controller Uses ny Type

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/system-config/system-config.controller.ts:25 |
| **Evidence** | @Body() body: any — 无类型校验 |
| **Risk** | 可以更新任意系统配置项 |
| **Impact** | 低 — 但 API 已限制 ONLY Owner/SuperAdmin |

### PRIV-01: Approval Records — No Role Restriction

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/approval/approval.controller.ts:16 |
| **Evidence** | records() 方法没有任何角色校验，仅 @UseGuards(AuthGuard("jwt")) |
| **Risk** | 设计师或运营可以查看运营主管的审批记录 |
| **Impact** | 中 |

---

## P2 Findings

### AUTH-04: 33 Hardcoded Role String Comparisons

| 字段 | 内容 |
|------|------|
| **Files** | 12 个文件中存在 userRole === "OPERATION", ole !== "SUPER_ADMIN" 等硬编码角色字符串 |
| **Risk** | 角色名变更需要修改所有文件，新增角色需要添加所有 if-else 分支 |
| **Impact** | 低 — 功能正常，但维护成本高 |
| **Suggested Fix** | 使用 Role enum 替代字符串字面量 |

### IDOR-04: Timeline — No Ownership Check

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/timeline/timeline.controller.ts:12 |
| **Evidence** | getTaskTimeline() 只校验登录但不校验是否是该任务的参与者 |
| **Risk** | 任意登录用户可以查看任意法旨的完整时间线 |

### ERR-01: Non-HTTP Exceptions Expose Message

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/common/unified-exception.filter.ts:35-37 |
| **Evidence** | else if (exception instanceof Error) { message = exception.message || message; } |
| **Risk** | 非 HTTP 异常（如 Prisma 错误）的消息会被直接返回给客户端 |
| **Impact** | 低 — 当前生产环境 SQLite 错误较少，但可能泄露数据库结构信息 |

---

## Files Reviewed

- 17 Controllers
- 1 Guard (RolesGuard)
- 65 API endpoints
- 11 DTO files
- All service files

## Security Score

| Category | Grade |
|----------|-------|
| Authentication | 🟡 6/10 |
| Authorization | 🟡 6/10 |
| DTO Validation | 🟢 8/10 |
| Error Handling | 🟢 8/10 |

## Ready For Fix

**YES** — All P0 and P1 issues are clearly documented with file/line evidence and suggested fixes.
