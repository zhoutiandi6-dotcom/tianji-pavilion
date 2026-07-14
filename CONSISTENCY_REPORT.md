# CONSISTENCY_REPORT.md

## 数据一致性审计报告

审计时间: 2026-07-03

---

## 1. Partial-Write Risks (部分写入风险)

### 1.1 WorkflowEngine.approve() - 中

问题: approvalRecord.create() + task.update(workflowStatus) + task.update(approverInfo) 三个独立写入，无事务包裹

后果:
- approvalRecord 已写入但 task 状态未更新 -> 审批记录显示已审批但任务仍为 PENDING_APPROVAL
- task 状态已更新但 approverInfo 未写入 -> 任务显示已审批但不知谁审批的

### 1.2 WorkflowEngine.reject() - 中

问题: 与 approve 相同

### 1.3 TasksService.remove() - 中

问题: imageTask.deleteMany() -> task.delete() 两步无事务

后果: 图片已删除但任务删除失败 -> 任务处于无图片的空壳状态

### 1.4 ImageTasksService.update() - 低

问题: imageTask.update() -> 多个后续操作(log, event, recalc)

风险: 如果 event 发布或 recalc 失败，imageTask 数据已更新但后续监听器未接收到通知

### 1.5 AuthService.login() - 低

问题: 登录失败阈值触发后 user.update(lockedUntil) -> logService.log() 两步

风险: 用户已锁定但日志丢失

---

## 2. Duplicate-Write Risks (重复写入风险)

### 2.1 recalcTaskStatus 重复调用

位置: workflow-engine/engine:recalcTaskStatus()

风险: ImageTask 的每次状态变更都调用 recalcTaskStatus。该函数会读取所有 ImageTask 并重新计算 Task 状态。
如果两个 ImageTask 状态变更同时发生，第二次 recalc 可能基于过期状态计算。

缓解因素: 当前为 SQLite 单线程写入，此风险极低

### 2.2 Event Bus 重复处理

位置: event-bus/event-bus.ts

风险: Event Bus 是进程内同步调用，不支持 at-least-once 语义

后果: 如果 listener 处理失败，事件不重试，WorkflowHistory / Audit / Notification 部分丢失

---

## 3. Missing Rollback Risks (缺失回滚风险)

### 3.1 approve/reject 三步骤 - 无回滚

如果 task.update status 失败，approvalRecord.create 无法自动回滚

### 3.2 remove 两步骤 - 无回滚

如果 task.delete 失败，imageTask.deleteMany 无法自动回滚

---

## 4. Event Order Issues (事件顺序问题)

### 4.1 recalcTaskStatus -> Completed 事件 (顺序正确)

流程:
1. imageTask.update() -> eventBus.publish(image_task.review_approved)
2. WorkflowListener -> recalcTaskStatus()
3. 发现全部 COMPLETED -> update task.workflowStatus
4. eventBus.publish(workflow.completed)

评价: 监听器会先收到"单个图片审核通过"再收到"整个法旨完成"。当前顺序正确，不构成风险。

### 4.2 WorkflowCreated 由 TasksService 发出而非 WorkflowEngine

位置: tasks.service.ts:create() 直接调用 eventBus.publish("workflow.created")

问题: WorkflowEngine.create() 存在但未被调用。WorkflowEngine 不是完整的唯一生命周期管理器。

---

## 5. Event Bus 可靠性分析

| 特性 | 当前 | 理想 |
|------|------|------|
| 持久化 | 否(在内存中) | 可持久化到 DB |
| 重试 | 否 | at-least-once |
| 死信队列 | 否 | 有 |
| 顺序保证 | 同步 FIFO | 同一线程 |

结论: 当前适用于 V1 内部局域网。V2 建议:
1. 将关键事件改为先写入 outbox 表再异步发送
2. 或升级到消息队列

---

## 6. 修复建议摘要

| 优先级 | 修复内容 | 复杂度 | 影响范围 |
|--------|----------|--------|----------|
| P0 | approve/reject 三步 $transaction | 2 行 | workflow-engine |
| P0 | remove 两步 $transaction | 2 行 | tasks |
| P1 | recalcTaskStatus listener 异常捕获 | 1 行 | workflow-engine |
| P1 | eventBus.publish 包裹 try/catch | 3 行 | event-bus |
| P2 | login 锁定 $transaction | 2 行 | auth |
| P2 | WorkflowCreated 统一由 Engine 发出 | 5 行 | tasks + engine |

## 7. 结论

当前代码单用户场景下 (SQLite + 单线程) 数据一致性风险较低。
主要问题集中在 approve/reject 和 remove 方法缺少事务包裹。
对于 V1 内部局域网管理工具，这些风险不会造成严重后果，但仍建议在 V1 正式部署前修复 P0 项。
