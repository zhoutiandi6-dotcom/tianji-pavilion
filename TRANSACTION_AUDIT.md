# TRANSACTION_AUDIT.md

## 事务与数据一致性审计报告

审计时间: 2026-07-03
审计范围: apps/server/src/ 全部 23 个后端模块

---

## 审计结论概要

| 风险等级 | 数量 |
|----------|------|
| 🔴 高风险 (数据不一致风险) | 3 |
| 🟡 中风险 (事件顺序风险) | 2 |
| 🟢 低风险 (可接受) | 4 |

---

## 🔴 高风险项

### H1: WorkflowEngine.approve() - 三步骤无事务

| 项目 | 内容 |
|------|------|
| 文件 | pps/server/src/workflow-engine/engine/index.ts |
| 方法 | pprove() / eject() |
| 步骤 | 1. pprovalRecord.create() -> 2. 	ask.update(workflowStatus) -> 3. 	ask.update(approverInfo) |
| 使用事务? | 否 |
| 风险 | 三步骤中任何一步失败，第1步的审批记录已写入，无法回滚 |
| 推荐 | 包裹在 prisma.\ 中 |

### H2: TasksService.remove() — 两步骤无事务

| 项目 | 内容 |
|------|------|
| 文件 | pps/server/src/tasks/tasks.service.ts |
| 方法 | emove() |
| 步骤 | 1. imageTask.deleteMany({ taskId }) -> 2. 	ask.delete({ id }) |
| 使用事务? | 否 |
| 风险 | 删除了图片任务但法旨删除失败，导致孤立法旨 |
| 推荐 | 包裹在 prisma.\ 中 |

### H3: AuthService.login() — 登录锁定无事务

| 项目 | 内容 |
|------|------|
| 文件 | pps/server/src/auth/auth.service.ts |
| 方法 | login() (失败路径) |
| 步骤 | 1. user.update(lockedUntil) -> 2. logService.log(login_locked) -> 3. 抛出异常 |
| 使用事务? | 否 |
| 推荐 | 将 user.update 和 log 包裹在事务中 |

---

## 🟡 中风险项

### M1: 事件在日志之后发布

| 涉及 | WorkflowEngine.submit(), withdraw(), pprove(), eject() |
|------|------|
| 执行顺序 | 1. DB writes -> 2. recordLog() -> 3. eventBus.publish() |
| 风险 | 如果 eventBus.publish() 的 listeners 抛出异常，日志已记录但事件未送达 |
| 评价 | 当前顺序正确（DB先提交再发事件）。应确保 listeners 不抛出未捕获异常 |

### M2: approvalRecord + task.update 不同步

| 涉及 | pprove(), eject() |
|------|------|
| 问题 | approvalRecord.create() 写入后、task.update() 之前如果进程崩溃，会产生孤立审批记录 |
| 推荐 | 使用 \ 包裹所有三步操作 |

---

## 🟢 低风险项

### L1: Task create

| 文件 | 	asks.service.ts:create() |
|------|------|
| 步骤 | 1. task.create() -> 2. log.log() -> 3. eventBus.publish(WorkflowCreated) |
| 评价 | 顺序正确。task.create 先完成才发事件 |

### L2: ImageTask update

| 文件 | image-tasks.service.ts:update() |
|------|------|
| 步骤 | 1. imageTask.update() -> 2. log.log() -> 3. eventBus.publish() -> 4. recalcTaskStatus() |
| 评价 | 先写 DB 再发事件。recalcTaskStatus 会链式写 DB + 发事件 |

### L3: User create

| 文件 | users.service.ts:create() |
|------|------|
| 步骤 | 1. user.create() -> 2. log.log() |
| 评价 | 单步骤 DB 写入，日志失败不影响 |

### L4: Announcement publish

| 文件 | nnouncement.service.ts |
|------|------|
| 步骤 | 1. announcement.update() -> 2. log.log() |
| 评价 | 单步骤 DB 写入，顺序正确 |

---

## 事件发布顺序总览

| 业务操作 | DB 写入 | Log | 事件发布 | 顺序是否正确 |
|----------|---------|-----|----------|-------------|
| Task Create | 先 | 后 | 最后 | DB->Log->Event |
| Task Update | 先 | 后 | - (无事件) | DB->Log |
| Task Delete | 无事务 | 后 | - | 建议用事务 |
| Submit | 先 | 后 | 最后 | DB->Log->Event |
| Withdraw | 先 | 后 | 最后 | DB->Log->Event |
| Approve | 3步无事务 | 后 | 最后 | 需事务 |
| Reject | 3步无事务 | 后 | 最后 | 需事务 |
| ImageTask Start | 先 | 后 | 最后 | DB->Log->Event |
| ImageTask Review | 先 | 后 | 最后 | DB->Log->Event+Recalc |
| RecalcTaskStatus | 单步 | - | 最后 | DB->Event |
| Login Lock | 无事务 | 后 | - | 需包裹 |

---

## 推荐修复优先级

P0: 修复 H1 (Approve三步骤事务) - 影响审批数据一致性
P0: 修复 H2 (Remove两步骤事务) - 影响法旨删除完整
P1: 修复 M1 (事件listener异常保护) - 影响通知可靠性
P2: 修复 H3 (login事务包裹) - 低概率但建议改进
