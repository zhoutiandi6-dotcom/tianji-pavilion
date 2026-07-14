# COUPLING_REPORT.md

## Module Coupling Audit

---

## Current Coupling

```
tasks.service.ts
  ├── → PrismaService (direct)
  ├── → OperationLogService (direct — to be replaced)
  ├── → EventBus (direct — publishes workflow.created)
  └── → DomainEvent classes (import)

image-tasks.service.ts
  ├── → PrismaService (direct)
  ├── → OperationLogService (direct)
  ├── → EventBus (direct — publishes 6 image_task events)
  ├── → WorkflowEngine (direct — calls recalcTaskStatus)
  └── → DomainEvent classes (import)

workflow-engine/engine/index.ts
  ├── → PrismaService (direct)
  ├── → EventBus (direct — publishes 5 workflow events)
  └── → OperationLogService (direct)
```

## P2 Finding

### CPL-01: tasks.service.ts Directly Calls EventBus (Known M2 Issue)

| 字段 | 内容 |
|------|------|
| **File** | `tasks.service.ts` |
| **Evidence** | 直接调用 `eventBus.publish("workflow.created")` 而非通过 `WorkflowEngine` |
| **Risk** | 低 — 功能正常，但破坏了 WorkflowEngine 封装边界 |
| **Suggested Fix** | 将 eventBus.publish 移至 WorkflowEngine，tasks.service 只调用 `engine.create()` |
| **Confidence** | 高 |

### CPL-02: 6 Modules Directly Depend on OperationLogService

| 字段 | 内容 |
|------|------|
| **Files** | auth, users, tasks, image-tasks, announcement, workflow-engine |
| **Evidence** | 所有模块直接注入 `OperationLogService` |
| **Note** | OpLog 已映射到 audit_events 表，但仍然直接调用而非通过 Domain Events |
| **Suggested Fix** | 逐步迁移到 Domain Events + AuditEventService |
| **Confidence** | 中 |

## Acceptable Coupling

| Dependency | Type | Reason |
|-----------|------|--------|
| image-tasks → WorkflowEngine.recalcTaskStatus() | 直接调用 | 业务逻辑需要实时计算 Task 状态，事件异步会延迟 |
| approval → WorkflowActions | 直接代理 | 设计为 WorkflowEngine 的入口层 |
| EventBus → Listeners | 事件解耦 | 符合设计目标 |

