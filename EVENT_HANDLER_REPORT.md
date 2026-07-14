# EVENT_HANDLER_REPORT.md

## Event Consumer (Listener) Audit

---

## Listeners

| Listener | Subscribed Events | File |
|----------|------------------|------|
| WorkflowHistoryService | 12 events (all workflow.* + image_task.*) | `workflow-history.service.ts` |
| AuditEventService | 13 events (all + task.updated) | `audit/services/audit-event.service.ts` |
| WorkflowNotificationService | 7 events | `workflow-notification.service.ts` |

## Listener Dependency Graph

```
Domain Events
  ├── → WorkflowHistoryService (writes workflow_history table)
  ├── → AuditEventService (writes audit_events table)
  └── → WorkflowNotificationService (writes notifications table)
```

✅ **无循环依赖** — 所有监听器只写入独立的表，不会触发新的事件。

## P1 Finding

### HND-01: Timeline Duplicates Events

| 字段 | 内容 |
|------|------|
| **File** | `timeline/timeline.service.ts` |
| **Evidence** | Timeline 创建**合成事件**（第5行硬编码 `"WorkflowCreated"` + approval records），同时又从 `workflowHistory` 读取 `"workflow.created"` 和 `"workflow.approved"` 事件。这导致每个创建和审批操作在 Timeline 中出现两次。 |
| **Root Cause** | Timeline 既手动聚合数据，又读取 workflowHistory — 两套逻辑产生重叠事件 |
| **Suggested Fix** | Timeline 应只从 workflowHistory 读取，移除合成事件和 approval_records 直接查询 |
| **Confidence** | 高 |

### HND-02: WorkflowNotification ignores workflow.withdrawn

| 字段 | 内容 |
|------|------|
| **File** | `workflow-notification.service.ts:onModuleInit()` |
| **Evidence** | 未订阅 `"workflow.withdrawn"` 事件 |
| **Risk** | 运营撤回审批后，运营主管不会收到通知 |
| **Suggested Fix** | 添加 `eventBus.subscribe("workflow.withdrawn", ...)` |
| **Confidence** | 中 |

## P2 Finding

### HND-03: Listener Exception Handling Acceptable

| 字段 | 内容 |
|------|------|
| **File** | `workflow-notification.service.ts` (all methods) |
| **Evidence** | 每个 Listener 方法都有 `try/catch`，异常不会传播到 Event Bus |
| **Risk** | 低 — 事件发布后部分 listener 失败不影响其他 listener |

