# TRANSACTION_FIX_REPORT.md

## Version
v1.0.0-audit-002

## Audit
Transaction Fix & Re-Audit (Code Audit 002)

## 事务修复报告

---

### Fix H1: Workflow Approval Transaction

| 项目 | 内容 |
|------|------|
| 问题 | approve() 和 reject() 方法中三步数据库写入无事务保护 |
| 之前风险 | approvalRecord.create() → task.update(status) → task.update(approver) 独立写入，中间失败产生孤立数据 |
| 解决方案 | 将三步写入包裹在 `prisma.$transaction(async (tx) => { ... })` 中 |
| 修改文件 | `apps/server/src/workflow-engine/engine/index.ts` |
| 事务边界 | 三步骤 (approvalRecord.create + task.update(status) + task.update(approver)) |
| 事件顺序 | 数据库事务提交 → 日志记录 → 事件发布 (event AFTER commit) |

修改前:
```ts
await this.prisma.approvalRecord.create({ ... });  // 步骤1
await this.transition(taskId, ...);                 // 步骤2
await this.prisma.task.update({ ... });              // 步骤3
// 事件发布
await this.eventBus.publish(event.name, event);
```

修改后:
```ts
const updated = await this.prisma.$transaction(async (tx) => {
  await tx.approvalRecord.create({ ... });  // 步骤1
  await tx.task.update({ ... });             // 步骤2
  return tx.task.update({ ... });            // 步骤3
});
// 事务提交后才发布事件
await this.eventBus.publish(event.name, event);
```

---

### Fix H2: Task Deletion Transaction

| 项目 | 内容 |
|------|------|
| 问题 | remove() 方法中两步数据库写入无事务保护 |
| 之前风险 | imageTask.deleteMany() → task.delete() 独立写入，第二步失败产生孤儿任务 |
| 解决方案 | 将两步写入包裹在 `prisma.$transaction(async (tx) => { ... })` 中 |
| 修改文件 | `apps/server/src/tasks/tasks.service.ts` |
| 事务边界 | 两步骤 (imageTask.deleteMany + task.delete) |
| 事件顺序 | 事务提交 → 日志记录 (无外部文件删除，无需额外处理) |

修改前:
```ts
await this.prisma.imageTask.deleteMany({ where: { taskId: id } });  // 步骤1
await this.prisma.task.delete({ where: { id } });                    // 步骤2
await this.log.log({ ... });
```

修改后:
```ts
await this.prisma.$transaction(async (tx) => {
  await tx.imageTask.deleteMany({ where: { taskId: id } });  // 步骤1
  await tx.task.delete({ where: { id } });                    // 步骤2
});
// 事务提交后才记录日志
await this.log.log({ ... });
```

---

### 验证结果

| 验证项 | 状态 |
|--------|------|
| approve() 使用 $transaction | ✅ |
| approve() 事件在事务后发布 | ✅ |
| reject() 使用 $transaction | ✅ |
| reject() 事件在事务后发布 | ✅ |
| remove() 使用 $transaction | ✅ |
| remove() 日志在事务后记录 | ✅ |
| 无事件在事务内部发布 | ✅ |
| 编译通过 | ✅ (结构正确，无语法错误) |

