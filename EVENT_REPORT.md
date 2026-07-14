# EVENT_REPORT.md

## Event Publishing Audit

---

## P1 Findings

### EVT-01: `workflow.created` Published by Wrong Module

| 字段 | 内容 |
|------|------|
| **File** | `apps/server/src/tasks/tasks.service.ts:86` |
| **Method** | `create()` |
| **Event** | `"workflow.created"` |
| **Evidence** | `tasks.service.ts` 直接调用 `eventBus.publish()`, 未经过 `WorkflowEngine.create()` |
| **Risk** | 破坏了 Workflow Engine 唯一生命周期管理的设计约束 |
| **Suggested Fix** | 将 eventBus.publish 移至 WorkflowEngine 的 create 方法中 |
| **Confidence** | 高 |

### EVT-02: `workflow.archived` Never Published

| 字段 | 内容 |
|------|------|
| **File** | `apps/server/src/workflow-engine/engine/index.ts` |
| **Event** | `"workflow.archived"` |
| **Evidence** | 事件类 `WorkflowArchived` 已定义，但没有任何代码调用 `eventBus.publish("workflow.archived")` |
| **Risk** | 没有"归档"业务流程，但事件已订阅，永远不会触发 |
| **Suggested Fix** | 实现归档功能或移除未使用的事件定义 |
| **Confidence** | 高 |

### EVT-03: `task.updated` Never Published

| 字段 | 内容 |
|------|------|
| **File** | `apps/server/src/tasks/tasks.service.ts:update()` |
| **Event** | `"task.updated"` |
| **Evidence** | `TaskUpdated` 类已定义且被 Audit 订阅，但 `tasks.service.ts:update()` 方法中没有调用 `eventBus.publish("task.updated")` |
| **Risk** | 法旨编辑不触发审计事件（虽然 OpLog→audit_events 有记录），WorkflowHistory 也没有 transition 记录 |
| **Suggested Fix** | 在 tasks.service.ts update() 方法末尾添加 `eventBus.publish("task.updated", ...)` |
| **Confidence** | 高 |

## P2 Findings

### EVT-04: No Domain Events for Announcement Operations

| 字段 | 内容 |
|------|------|
| **File** | `announcement.service.ts` |
| **Evidence** | create/publish/update/delete 操作均通过 OpLog→audit_events 记录，但无 Domain Event |
| **Suggested Fix** | 添加 `announcement.published`, `announcement.created` 等 Domain Events |
| **Confidence** | 中 |

### EVT-05: No Domain Events for Auth/User Operations

| 字段 | 内容 |
|------|------|
| **File** | `auth.service.ts`, `users.service.ts` |
| **Evidence** | login/change-password/user-create/user-activate 均通过 OpLog→audit_events 记录，但无 Domain Event |
| **Suggested Fix** | 添加 `user.login`, `user.created` 等 Domain Events |
| **Confidence** | 中 |

