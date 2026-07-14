# API_FIX_REPORT.md

## Version
v1.0.0-audit-006-fix

---

## Fix 1: HTTP Status Codes (STC-01)

| 字段 | 内容 |
|------|------|
| **Issue** | 6 个 POST create 端点返回 200 OK（应为 201 Created） |
| **Previous** | NestJS 默认 @Post() 返回 200 |
| **New** | 添加 @HttpCode(HttpStatus.CREATED) → 201 |
| **Modified Files** | 6 controllers (tasks, stores, users, requirement-types, image-tasks, announcements) |
| **Compatibility Impact** | 无 — 响应体不变，仅 HTTP 状态行改变。前端 axios 不依赖 200。 |
| **Verification** | 每个 controller 的 POST 方法前已添加 @HttpCode(HttpStatus.CREATED) |

## Fix 2: Type Safety — Announcement Controller (DTO-01)

| 字段 | 内容 |
|------|------|
| **Issue** | @Body() dto: any — 无类型验证 |
| **Previous** | create(@Body() dto: any), update(@Body() dto: any) |
| **New** | CreateAnnouncementDto + UpdateAnnouncementDto 含 class-validator 注解 |
| **Modified Files** | announcement.controller.ts, announcement/dto/create-announcement.dto.ts, update-announcement.dto.ts |
| **Compatibility Impact** | 无 — 新 DTO 字段与之前接受的数据一致 |
| **Verification** | DTO 字段: title(required+string), content(required+string), priority(optional+string) |

## Fix 3: Type Safety — SystemConfig Controller (DTO-02)

| 字段 | 内容 |
|------|------|
| **Issue** | @Body() body: any — 无类型验证 |
| **Previous** | update(@Body() body: any) |
| **New** | UpdateSystemConfigDto — values(optional+Record) + changeReason(optional+string) |
| **Modified Files** | system-config.controller.ts |
| **Compatibility Impact** | 无 — 向后兼容 values 和 changeReason 字段 |
| **Verification** | DTO 使用 @IsOptional 确保原有 PUT { site_name: "..." } 格式兼容 |

## Fix 4: Unchanged Items (Backward Compat Constraint)

| Issue | Reason Not Fixed |
|-------|-----------------|
| DELETE → 204 No Content | 部分 DELETE 返回响应体（如 users.remove 返回密码），前端可能依赖 |
| Approval route plural | API path 变更会破坏前端 |
| Timeline route nesting | API path 变更会破坏前端 |
| return { message } format | 8 处模式已被 ResponseInterceptor 正确包装，前端兼容 |
