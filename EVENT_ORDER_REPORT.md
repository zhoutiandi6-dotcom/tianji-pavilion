# EVENT_ORDER_REPORT.md

## Event Ordering Audit

---

## Verified: All Events Published After DB Commit

| File | Event | DB Before Event? | Verified |
|------|-------|-----------------|----------|
| tasks.service.ts:create() | workflow.created | ✅ task.create() first | Audit 002 |
| image-tasks.service.ts:update() | image_task.* | ✅ imageTask.update() first | Audit 002 |
| WorkflowEngine.approve() | workflow.approved | ✅ $transaction commits first | Audit 002 Fix |
| WorkflowEngine.reject() | workflow.rejected | ✅ $transaction commits first | Audit 002 Fix |
| WorkflowEngine.submit() | workflow.submitted | ✅ task.update() first | Audit 002 |
| WorkflowEngine.withdraw() | workflow.withdrawn | ✅ task.update() first | Audit 002 |
| WorkflowEngine.recalcTaskStatus() | workflow.completed | ✅ task.update() first | Audit 002 |

## P1 Finding

### ORD-01: Workflow Engine Events Published Before Event Listener Has Complete Data

| 字段 | 内容 |
|------|------|
| **File** | `WorkflowEngine.submit()`, `approve()`, `reject()` |
| **Evidence** | Event published with the event data created from the task before the update. The event is created from the OLD task data (before transition), not the updated data. In `submit()`: `const task = await this.getTask(taskId)` → `const updated = await this.transition(...)` → `new WorkflowSubmitted(taskId, userId, task.serialNumber)` — serialNumber is from old task, which is fine. But the listener won't see the new workflowStatus until it re-queries the DB. |
| **Risk** | 低 — Listener 重新查询 DB 即可获取最新状态 |
| **Suggested Fix** | 无必要 — 当前顺序正确，Listener 自行查询最新数据 |
| **Confidence** | 低 |

## Conclusion

✅ 所有事件的发布顺序正确：DB 先提交 → 事件后发布。
无违反 Audit 002/004 修复的事件顺序问题。
