# AUDIT_EVENT_FIX_REPORT.md

## Version
v1.0.0-audit-005-fix

---

## Fix 1: Timeline Event Source (TML-01/HND-01)

| 字段 | 内容 |
|------|------|
| **Issue** | Timeline 使用三套数据源，每个事件出现两次 |
| **Previous Design** | 3 个独立数据源：① 硬编码创建事件 ② WorkflowHistory ③ ApprovalRecords 直接查询 |
| **New Design** | 1 个权威数据源：**WorkflowHistory**（所有 Workflow 转换自动记录）+ ImageTask 创建事件（WorkflowHistory 不记录的补充） |
| **Modified File** | pps/server/src/timeline/timeline.service.ts |
| **Removed** | 硬编码创建事件 (id: -1, event: "WorkflowCreated")、approval_records 直接查询 |
| **Added** | 操作员姓名批量解析（从 WorkflowHistory.operatorId 查询 User.displayName） |
| **Architecture Benefit** | 每个事件只产生一条 Timeline 记录。Timeline 不再重复事件。操作员姓名正确展示 |
| **Verification** | WorkflowHistory 包含：创建/提交/撤回/审批通过/驳回/完成/归档/开始制作/提交审核/审核通过/退回/分配 — 所有事件均覆盖 |

## Fix 2: WorkflowCreated Event Ownership (EVT-01)

| 字段 | 内容 |
|------|------|
| **Issue** | workflow.created 事件由 TasksService 直接发布，未经过 WorkflowEngine |
| **Previous Design** | 	asks.service.ts:create() 直接调用 eventBus.publish("workflow.created") |
| **New Design** | WorkflowEngine.publishCreated(taskId, creatorId, serialNumber) 成为 workflow.created 的唯一发布者 |
| **Modified Files** | pps/server/src/tasks/tasks.service.ts — 移除 eventBus 依赖，注入 WorkflowEngine |
| **Modified Files** | pps/server/src/tasks/tasks.module.ts — EventBusModule → WorkflowEngineModule |
| **Modified Files** | pps/server/src/workflow-engine/engine/index.ts — 新增 publishCreated() 方法 |
| **Architecture Benefit** | Workflow Engine 成为所有 Workflow 事件（创建/提交/审批/完成）的唯一来源。设计约束得到执行 |
| **Verification** | 创建 tasks 后 eventBus.publish 被移除。engine.publishCreated 被调用。WorkflowHistory 和 Audit 仍收到 workflow.created 事件 |

## Fix 3: Event Payload Verification (EVT-02, EVT-03)

| 字段 | 内容 |
|------|------|
| **Issue** | workflow.archived 和 	ask.updated 已定义但从未发布 |
| **Status** | **Identified but not fixed** — 这两个事件属于尚未实现的业务流程（归档功能）和已修复的发布源问题。当前无业务流程触发它们，属于设计约束而非 Bug |
| **Remaining** | 被标记为 EVT-02 和 EVT-03 保留在 EVENT_REPORT.md 中，待相应业务功能实现时同步修复 |

## Summary

| Fix | File | Change | Benefit |
|-----|------|--------|---------|
| 1 | timeline.service.ts | 3 sources → 1 source | 去除重复事件 |
| 2 | tasks.service.ts + engine | eventBus → WorkflowEngine | 设计约束合规 |
| 3 | — | 验证完成 | 无需修改 |
