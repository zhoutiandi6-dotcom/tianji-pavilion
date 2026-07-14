# EXCEPTION_REPORT.md

## Exception Handling Audit

---

## Global Exception Filter

| 特性 | 状态 |
|------|------|
| File | common/unified-exception.filter.ts |
| @Catch() | ✅ All exceptions |
| Stack trace leaked? | ❌ No (logged only) |
| Unified format | ✅ { success, code, message, data, requestId } |
| Error codes | ✅ 30+ business codes |

## Exception Coverage

| Exception Type | Catches? | Status Code | Code |
|---------------|----------|-------------|------|
| BadRequestException | ✅ | 400 | BAD_REQUEST |
| UnauthorizedException | ✅ | 401 | AUTH_UNAUTHORIZED |
| ForbiddenException | ✅ | 403 | AUTH_FORBIDDEN |
| NotFoundException | ✅ | 404 | NOT_FOUND |
| ConflictException | ✅ | 409 | CONFLICT |
| HttpException (other) | ✅ | various | computed |
| Non-HTTP Error | ✅ | 500 | SYSTEM_ERROR |
| Prisma Error | ⚠️ | 500 | SYSTEM_ERROR (message exposed) |

## P1 Findings

### EXC-01: Non-HTTP Error Message Exposed

| 字段 | 内容 |
|------|------|
| **File** | unified-exception.filter.ts:35-37 |
| **Evidence** | else if (exception instanceof Error) { message = exception.message; } |
| **Risk** | Prisma 或其他库的错误消息可能泄露数据库结构 |
| **Suggested Fix** | 非 HTTP 异常统一返回"服务器内部错误"，仅日志记录具体信息 |

## P2 Findings

### EXC-02: Missing Rollback in Event Listener

| 字段 | 内容 |
|------|------|
| **Files** | workflow-notification.service.ts |
| **Evidence** | Listener 中 	ry/catch 捕获异常但不回滚任何操作 |
| **Assessment** | 可接受 — Listener 只写通知表，失败不影响业务数据 |

### EXC-03: Validation Pipe Config Acceptable

| 字段 | 内容 |
|------|------|
| **File** | main.ts |
| **Config** | whitelist: true, forbidNonWhitelisted: true, transform: true |
| **Assessment** | ✅ 严格模式，自动剔除多余字段 |

## Summary

| Category | Score |
|----------|-------|
| Exception Coverage | 🟢 9/10 |
| Stack Trace Protection | 🟢 10/10 |
| Error Code Quality | 🟢 9/10 |
| Non-HTTP Handling | 🟡 7/10 (message exposure) |
