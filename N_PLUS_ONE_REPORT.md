# N_PLUS_ONE_REPORT.md

## N+1 Query Risk Audit

---

## P1 Findings

### N1-01: WorkflowNotification — Notification per Manager (Loop INSERT)

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/workflow-notification/workflow-notification.service.ts:46,110 |
| **Pattern** | or (const m of managers) { await this.createNotification(...) } |
| **Evidence** | 审批提交时查询所有 OPERATION_MANAGER，然后逐一 INSERT |
| **Impact** | 假设 5 个管理者 = 6 次查询（1 次 findMany + 5 次 INSERT） |
| **Suggested Fix** | 使用 	his.prisma.notification.createMany() 批量插入 |
| **Confidence** | 高 |

### N1-02: WorkflowNotification — ImageTask per Designer (Loop + findUnique)

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/workflow-notification/workflow-notification.service.ts:56-61 |
| **Pattern** | or (const it of imageTasks) { await this.createNotification(it.designerId, ...) } |
| **Evidence** | 审批通过后遍历所有 ImageTask，每个发出独立通知 |
| **Impact** | 10 个图片任务 = 10 次 INSERT |
| **Suggested Fix** | 使用 createMany |
| **Confidence** | 中 |

### N1-03: SystemConfig — Batch Update Loop

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/system-config/system-config.service.ts:41 |
| **Pattern** | or (const [key, value] of Object.entries(updates)) |
| **Evidence** | 每个配置项独立进行 findUnique → update/create |
| **Impact** | 10 个配置 = 10-20 次查询 |
| **Suggested Fix** | 使用批量更新或逐条 UPSERT 但减少 read-before-write |
| **Confidence** | 高 |

---

## P2 Findings

### N1-04: RolesPermissions — Deep Include N+1

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/roles-permissions/roles-permissions.service.ts:10-13 |
| **Pattern** | include: { rolePermissions: { include: { permission: true } } } |
| **Evidence** | Prisma 对每个 rolePermission 发出一条额外查询来加载 permission |
| **Impact** | 7 角色 × ~10 权限 = 70+ 额外查询 |
| **Suggested Fix** | 接受此模式（角色数固定为 7，不会增长） |
| **Confidence** | 低（小表可接受） |
