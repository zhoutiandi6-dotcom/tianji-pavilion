# RESPONSE_REPORT.md

## Response Format Audit

---

## Unified Response Interceptor

| 特性 | 状态 |
|------|------|
| File | common/response.interceptor.ts |
| Applied | ✅ Global |
| Success format | { success, code, message, data, requestId } |
| Error format | { success: false, code, message, data: null, requestId } |
| Inconsistent? | ✅ Detected |

## P1 Findings

### RSP-01: 8 Endpoints Return Inconsistent Format

| 字段 | 内容 |
|------|------|
| **Files** | uth.service.ts (3), 
otifications.service.ts (1), equirement-types.service.ts (1), stores.service.ts (1), users.service.ts (2) |
| **Pattern** | eturn { message: "操作成功" } |
| **Issue** | 这些返回值没有 success/code 字段。ResponseInterceptor 会将其当作 data 包装。 |
| **Result** | 前端收到 { success: true, data: { message: "密码修改成功" } } |
| **Good Example** | 	asks.service.ts → eturn { items, total, page, pageSize } (被正确包装) |

### RSP-02: Notification Unread Count Returns Raw Object

| 字段 | 内容 |
|------|------|
| **File** | 
otifications.controller.ts:18 |
| **Pattern** | eturn { count } |
| **Result** | 前端收到 { success: true, data: { count: 5 } } |

## P2 Findings

### RSP-03: Health Check Returns Custom Format

| 字段 | 内容 |
|------|------|
| **File** | health.controller.ts:12-14 |
| **Pattern** | eturn { status: "ok", database: "connected" } |
| **Result** | { success: true, data: { status: "ok", database: "connected" } } |
| **Assessment** | 功能正常，健康检查接口格式可接受 |

## Summary

| 类别 | 一致 | 不一致 |
|------|------|--------|
| 成功响应格式 | 57 endpoints | 8 endpoints (raw message) |
| 错误响应格式 | 65 endpoints | 0 endpoints |
| 分页响应格式 | 3 modules | 2 modules (users, audit) |
