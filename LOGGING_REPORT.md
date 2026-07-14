# LOGGING_REPORT.md

## Logging Audit

---

## Logging Implementation

| 特性 | 状态 |
|------|------|
| Logger | common/logger.service.ts (AppLogger) |
| Format | JSON ({ timestamp, level, message, data }) |
| Levels | info, error, warn, debug, verbose |
| Global | ✅ (NestJS AppLogger) |

## Structured Logging Coverage

| Module | Logs Events? | Log Format | Status |
|--------|-------------|------------|--------|
| AuthService | ✅ Login, lockout, password change | OpLog → audit_events | 🟢 |
| TasksService | ✅ Create, update, delete | OpLog → audit_events | 🟢 |
| ImageTasksService | ✅ Status changes | OpLog → audit_events | 🟢 |
| AnnouncementService | ✅ CRUD + publish | OpLog → audit_events | 🟢 |
| UsersService | ✅ Create, update, activate | OpLog → audit_events | 🟢 |
| WorkflowEngine | ✅ Transitions | OpLog → audit_events | 🟢 |
| ResponseInterceptor | ✅ Request/Response timing | AppLogger | 🟢 |
| ExceptionFilter | ✅ All exceptions | AppLogger | 🟢 |
| EventBus | ✅ Event publish | AppLogger | 🟢 |

## P1 Findings

### LOG-01: Console.log on Startup

| 字段 | 内容 |
|------|------|
| **File** | main.ts:57 |
| **Evidence** | console.log(\🚀 天机阁服务已启动: http://localhost:\/api\) — 使用 console.log 而非 AppLogger |
| **Confidence** | 中 |

### LOG-02: Sensitive Data in Logging (Potential)

| 字段 | 内容 |
|------|------|
| **Files** | All services |
| **Evidence** | OpLog→audit_events 记录 content 字段包含法旨标题等业务信息，不包含密码 |
| **Risk** | 低 — 日志中未发现明文密码或 Token |
| **Confidence** | 高 |

## P2 Findings

### LOG-03: No Log Rotation Configuration

| 字段 | 内容 |
|------|------|
| **Evidence** | 日志写入 stdout/stderr (Docker) 或控制台。无日志文件轮转配置 |
| **Confidence** | 低 — Docker 本身处理日志管理 |
