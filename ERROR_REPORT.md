# ERROR_REPORT.md

## Exception Exposure Report

---

## Unified Exception Filter

| 字段 | 状态 |
|------|------|
| File | common/unified-exception.filter.ts |
| Applied | ✅ (global) |
| Catches all exceptions | ✅ @Catch() |
| Hides stack trace | ✅ (logged but not returned to client) |
| Returns unified JSON | ✅ { success, code, message, data, requestId } |
| Standard error codes | ✅ (30+ codes in error-codes.ts) |

## Findings

### ERR-01: Non-HTTP Exception Message Exposed

| 字段 | 内容 |
|------|------|
| **File** | unified-exception.filter.ts:35-37 |
| **Code** | else if (exception instanceof Error) { message = exception.message; } |
| **Risk** | Prisma 或其他库抛出的非 HTTP 异常的消息会直接返回给客户端，可能泄露数据库结构 |
| **Example** | Prisma 抛出的 Unique constraint failed on the fields: (\username\) — 泄露字段名 |
| **Impact** | 低 — 内部网络可使用，但外网部署有风险 |
| **Fix** | 对非 HttpException 统一返回 "服务器内部错误" 而非具体错误消息 |

### ERR-02: Console Log on Startup

| 字段 | 内容 |
|------|------|
| **File** | main.ts:57 |
| **Code** | console.log(\🚀 ...\) |
| **Issue** | 使用 console.log 而非 AppLogger |
| **Impact** | 低 — 不影响安全 |

## Verdict

✅ 统一异常过滤器正常工作，无堆栈泄漏风险。
⚠️ ERR-01 建议修复（P2）。
