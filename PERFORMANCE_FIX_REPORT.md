# PERFORMANCE_FIX_REPORT.md

## Version
v1.0.0-audit-004-fix

---

## Fix 1: Dashboard Count Queries (QRY-01)

| 字段 | 内容 |
|------|------|
| **Issue** | 每个 Dashboard 请求执行 18 个独立 count() 查询 |
| **Previous Design** | `Promise.all([ 16 x count(), 2 x findMany ])` = 18 DB queries per request |
| **Optimized Design** | 1 条 `$queryRawUnsafe` SQL + 2 条 `findMany` = 3 DB queries per request |
| **Reason** | 17 个 count() 合并为 1 条 SQLite 多子查询语句，减少 15 次 DB 往返 |
| **Modified File** | `apps/server/src/dashboard/dashboard.controller.ts` |
| **Performance Benefit** | ~18 queries → ~3 queries (83% reduction) |
| **Risk** | 低 — 使用子查询，结果与之前完全相同 |
| **Verification** | 查询返回列名与之前代码使用的属性名称一致 |

## Fix 2: N+1 Notification Batch Write (QRY-05, N1-01, N1-02)

| 字段 | 内容 |
|------|------|
| **Issue** | `for (const m of managers) { await this.createNotification(...) }` — 每个管理者独立 INSERT |
| **Previous Design** | 逐个 await，N 个管理者 = N 次 DB 往返 |
| **Optimized Design** | `await this.prisma.notification.createMany({ data: [...] })` |
| **Modified File** | `apps/server/src/workflow-notification/workflow-notification.service.ts` |
| **Performance Benefit** | N 次 INSERT → 1 次 INSERT (批量) |
| **Risk** | 低 — createMany 是标准 Prisma 批量操作 |
| **Verification** | 3 处循环替换为 createMany (onSubmitted, onApproved, onCompleted) |

## Fix 3: SystemConfig Batch Update (QRY-04, N1-03)

| 字段 | 内容 |
|------|------|
| **Issue** | `for (const [key, value] of Object.entries(updates)) { await this.set(key, value) }` — 逐键独立更新 |
| **Previous Design** | 循环中每次迭代执行 findUnique + update/create (2 queries per key) |
| **Optimized Design** | `await this.prisma.$transaction(async (tx) => { for ... })` — 所有操作在同一 DB 事务中 |
| **Modified File** | `apps/server/src/system-config/system-config.service.ts` |
| **Performance Benefit** | SQLite 事务减少写锁定开销 |
| **Risk** | 低 — 单事务执行，失败自动回滚 |
| **Verification** | 循环体移至事务回调内部 |

## Fix 4: ImageTask Merge Aggregates (QRY-06)

| 字段 | 内容 |
|------|------|
| **Issue** | `imageIndex` 和 `sortOrder` 各自调用一次 `aggregate` |
| **Previous Design** | `this.prisma.imageTask.aggregate({ _max: { imageIndex } })` + 重复调用 `{ _max: { sortOrder } }` |
| **Optimized Design** | `this.prisma.imageTask.aggregate({ _max: { imageIndex, sortOrder } })` |
| **Modified File** | `apps/server/src/image-tasks/image-tasks.service.ts` |
| **Performance Benefit** | 2 queries → 1 query (50% reduction) |
| **Risk** | 无风险 |

## Fix 5: Maximum Page Size (PAG-01)

| 字段 | 内容 |
|------|------|
| **Issue** | 分页接口无最大 pageSize 限制，客户端可请求任意大数据量 |
| **Previous Design** | `pageSize` 参数未校验 |
| **Optimized Design** | 所有分页服务添加 `pageSize = Math.min(pageSize, 100)` |
| **Modified Files** | tasks, notifications, announcements, audit, operation-logs |
| **Performance Benefit** | 防止恶意大分页查询 |
| **Risk** | 低 |

## Fix 6: Users List Pagination (PAG-02)

| 字段 | 内容 |
|------|------|
| **Issue** | 用户列表无分页，加载全部用户 |
| **Previous Design** | `findMany()` 无 skip/take |
| **Optimized Design** | `findMany({ skip, take: pageSize })` + `count()` |
| **Modified Files** | `users.service.ts`, `users.controller.ts`, `frontend users/page.tsx` |
| **Performance Benefit** | 1000 用户时从全表扫描变为分页查询 |
| **Risk** | 中 — 前端响应格式改变（数组 → `{ items, total }`），已更新前端代码 |

---

## Summary

| Fix | File | Change | Benefit |
|-----|------|--------|---------|
| 1 | dashboard.controller.ts | 18 count → 1 raw SQL | 83% query reduction |
| 2 | workflow-notification.service.ts | loop → createMany | N→1 INSERT |
| 3 | system-config.service.ts | loop → transaction | atomic batch |
| 4 | image-tasks.service.ts | 2 aggregates → 1 | 50% reduction |
| 5 | 5 files | add max pageSize | prevent DoS |
| 6 | users.service.ts | add pagination | O(n)→O(pageSize) |
