# STATUS_CODE_REPORT.md

## HTTP Status Code Audit

---

## Current Status Code Usage

| Endpoint Pattern | Current Status | Expected Status | Status |
|-----------------|---------------|-----------------|--------|
| GET (list) | 200 (interceptor) | 200 OK | ✅ |
| GET (single) | 200 (interceptor) | 200 OK | ✅ |
| POST (create) | 200 (interceptor) | **201 Created** | ❌ |
| PATCH (update) | 200 (interceptor) | 200 OK | ✅ |
| DELETE (remove) | 200 (interceptor) | **204 No Content** | ❌ |
| POST (action) | 201, 200 (mixed) | 200 OK | ✅ |
| Validation Error | 400 | 400 Bad Request | ✅ |
| Unauthenticated | 401 | 401 Unauthorized | ✅ |
| Forbidden | 403 | 403 Forbidden | ✅ |
| Not Found | 404 | 404 Not Found | ✅ |
| Conflict | 409 | 409 Conflict | ✅ |
| Server Error | 500 | 500 Internal Error | ✅ |

## P1 Findings

### STC-01: POST Create Endpoints Return 200 Instead of 201

| 字段 | 内容 |
|------|------|
| **Evidence** | 所有 POST 端点（如 POST /api/tasks, POST /api/stores）返回 200 OK |
| **Files** | All controllers |
| **Expected** | 201 Created — 表示资源已创建 |
| **Fix** | NestJS @HttpCode(HttpStatus.CREATED) |

### STC-02: DELETE Endpoints Return 200 Instead of 204

| 字段 | 内容 |
|------|------|
| **Evidence** | DELETE 端点（如 DELETE /api/tasks/:id）返回 200 with { success: true } |
| **Expected** | 204 No Content — 删除成功无需响应体 |

## P2 Findings

### STC-03: POST Action Endpoints Mixed Codes

| 字段 | 内容 |
|------|------|
| **Evidence** | POST /api/users/:id/activate → 200, POST /api/announcements/:id/publish → 200 |
| **Expected** | 200 OK (actions) - ✅ current is correct |

### STC-04: Raw Message Returns Bypass Interceptor

| 字段 | 内容 |
|------|------|
| **Evidence** | 8 处 eturn { message: "..." } (auth.service:2, notifications:1, etc.) |
| **Issue** | ResponseInterceptor 检测到 { message } 没有 success 字段，会包装为 { success: true, data: { message } } |
| **Result** | 前端收到 { data: { message: "..." } } 而非 { message: "..." } — 功能正常但格式不统一 |
