# EVENT_REVIEW.md

## Version
v1.0.0-audit-005-fix

---

## Timeline (Fix 1)

**PASS** ✅

- 硬编码创建事件已移除
- Approval records 直接查询已移除
- WorkflowHistory 成为唯一权威数据源
- 操作员姓名已通过批次查询正确解析
- ImageTask 创建事件保留（非 WorkflowHistory 记录）

## WorkflowCreated Ownership (Fix 2)

**PASS** ✅

- TasksService 不再直接调用 eventBus.publish("workflow.created")
- WorkflowEngine.publishCreated() 成为唯一发布点
- TasksModule 已更换为 WorkflowEngineModule 依赖
- EventBusModule 依赖已移除

## Payload Verification (Fix 3)

**PASS** ✅

| 事件 | Entity ID | Operator | 上下文 | 状态 |
|------|-----------|----------|--------|------|
| workflow.created | taskId | creatorId | serialNumber | ✅ |
| workflow.submitted | taskId | userId | serialNumber | ✅ |
| workflow.approved | taskId | approverId | serialNumber, comment | ✅ |
| workflow.rejected | taskId | approverId | serialNumber, comment | ✅ |
| workflow.completed | taskId | — | serialNumber | ✅ |
| image_task.* | imageTaskId, taskId | designerId | imageTitle | ✅ |
| TaskUpdated | taskId | userId | changes | ⚠️ Not published |

## Listener Side Effects (Fix 4)

**PASS** ✅

| Listener | Writes To | Modifies Business Modules? | Status |
|----------|-----------|---------------------------|--------|
| WorkflowHistoryService | workflow_history | ❌ No (only audit table) | ✅ |
| AuditEventService | audit_events | ❌ No (only audit table) | ✅ |
| WorkflowNotificationService | notifications | ❌ No (only notification) | ✅ |

## Remaining P1

| ID | Issue | Reason |
|----|-------|--------|
| EVT-02 | workflow.archived never published | 归档功能尚未实现 |
| EVT-03 | task.updated never published | 需要在 TasksService.update() 中添加 |
| HND-02 | workflow.withdrawn not subscribed by Notif | 功能增强，非修复 |
| ALG-01 | SystemConfig not audited | 功能增强，非修复 |

## Remaining P2

| ID | Issue |
|----|-------|
| RLI-01 | No event retry |
| RLI-02 | No event persistence |
| CPL-02 | 6 modules depend on OpLog |
| EVT-04/05 | No events for announcement/user operations |

## Ready For Next Audit

**YES** ✅
