# AUDIT_LOG_REPORT.md

## Audit Log Coverage Audit

---

## Audit Sources

Current audit has two sources that both write to `audit_events`:

1. **AuditEventService** (event-driven) — 13 Domain Events automatically captured
2. **OperationLogService** (direct calls) — Auth, User, Announcement operations via `logService.log()`

## Coverage Matrix

| Operation | Domain Event | OpLog→Audit | AuditEvent | Covered? |
|-----------|-------------|-------------|-----------|----------|
| Task Create | ✅ workflow.created | ✅ | ✅ | ✅ |
| Task Update | ❌ task.updated not published | ✅ | ❌ | ⚠️ (via OpLog) |
| Task Delete | ❌ no event | ✅ | ❌ | ⚠️ (via OpLog) |
| Submit Approval | ✅ workflow.submitted | ✅ | ✅ | ✅ |
| Withdraw Approval | ✅ workflow.withdrawn | ✅ | ✅ | ✅ |
| Approve | ✅ workflow.approved | ✅ | ✅ | ✅ |
| Reject | ✅ workflow.rejected | ✅ | ✅ | ✅ |
| ImageTask Start | ✅ image_task.started | ✅ | ✅ | ✅ |
| ImageTask Review | ✅ image_task.review_* | ✅ | ✅ | ✅ |
| Assign Designer | ✅ image_task.assigned | ✅ | ✅ | ✅ |
| Login | ❌ no event | ✅ | ❌ | ⚠️ (via OpLog) |
| Password Change | ❌ no event | ✅ | ❌ | ⚠️ (via OpLog) |
| User Create | ❌ no event | ✅ | ❌ | ⚠️ (via OpLog) |
| User Update | ❌ no event | ✅ | ❌ | ⚠️ (via OpLog) |
| User Activate | ❌ no event | ✅ | ❌ | ⚠️ (via OpLog) |
| User Deactivate | ❌ no event | ✅ | ❌ | ⚠️ (via OpLog) |
| Announcement Create | ❌ no event | ✅ | ❌ | ⚠️ (via OpLog) |
| Announcement Publish | ❌ no event | ✅ | ❌ | ⚠️ (via OpLog) |
| SystemConfig Update | ❌ no event | ❌ | ❌ | ❌ **Not audited** |

## P1 Finding

### ALG-01: SystemConfig Update Not Audited

| 字段 | 内容 |
|------|------|
| **File** | `system-config.service.ts:updateBatch()` |
| **Evidence** | updateBatch 在事务中更新配置，但没有任何审计日志（无论 Domain Event 还是 OpLog） |
| **Risk** | 系统配置变更不可追溯 |
| **Suggested Fix** | 在事务后添加 `logService.log()` 或发布 Domain Event |
| **Confidence** | 高 |

### ALG-02: 11 Operations Only Audited via Deprecated OpLog Path

| 字段 | 内容 |
|------|------|
| **Files** | auth.service.ts, users.service.ts, announcement.service.ts, tasks.service.ts |
| **Evidence** | task update/delete, login, user ops, announcement ops 均通过 OpLog→audit_events 记录 |
| **Risk** | 低 — 数据确实写入了 audit_events 表，可以从 GET /api/audit 查到 |
| **Note** | OpLog 已映射到 audit_events 表，所以这些操作在审计系统中仍然可见 |
| **Confidence** | 高 — 功能正常，代码路径不同但数据目的地相同 |

