# QUERY_REPORT.md

## Prisma Query Audit

**Audit**: Code Audit 004 - Database Performance
**Date**: 2026-07-03

---

## Query Volume

| Operation | Count | % of Total |
|-----------|-------|------------|
| findUnique | 40 | 42% |
| findMany | 27 | 28% |
| count | 10 | 10% |
| create | 17 | 18% |
| update | 29 | 30% |
| delete | 4 | 4% |
| aggregate | 2 | 2% |
| findFirst | 3 | 3% |
| updateMany | 2 | 2% |
| **Total** | **~95** | |

---

## P1 Findings

### QRY-01: Dashboard 19 Sequential Count Queries

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/dashboard/dashboard.controller.ts:27-44 |
| **Evidence** | Promise.all([ 16 count() queries + 2 findMany ]) = 18 prisma queries per dashboard request |
| **Schemas** | task, imageTask, user, approvalRecord, operationLog |
| **Estimated Impact** | 1M records: ~300-500ms per query, ~3-5s total dashboard load time |
| **Suggested Fix** | 合并为 3-4 个聚合查询，或使用缓存层 |
| **Confidence** | 高 |

### QRY-02: Missing Pagination on 4 APIs

| Endpoints | File | Issue |
|-----------|------|-------|
| GET /api/stores | stores.service.ts:11 | 全表扫描，无 limit |
| GET /api/requirement-types | equirement-types.service.ts:11 | 全表扫描，无 limit |
| GET /api/roles-permissions/roles | oles-permissions.service.ts:9 | 全表扫描，无 limit |
| GET /api/roles-permissions/permissions | oles-permissions.service.ts:31 | 全表扫描，无 limit |

**Note**: 门店/需求类型/角色表是小表(<100条)，实际影响很小。标记为维护问题。

### QRY-03: No Maximum Page Size

| 字段 | 内容 |
|------|------|
| **Evidence** | 所有分页接口的 pageSize 默认值可被客户端覆盖为任意大值 |
| **Affected** | tasks, notifications, announcements, audit, operation-logs |
| **Risk** | 客户端请求 ?pageSize=100000 会导致大量数据加载 |
| **Suggested Fix** | 添加 const maxPageSize = 100; if (pageSize > maxPageSize) pageSize = maxPageSize; |
| **Confidence** | 中 |

### QRY-04: Inefficient Batch Update in SystemConfig

| 字段 | 内容 |
|------|------|
| **File** | system-config.service.ts:41 |
| **Evidence** | or (const [key, value] of Object.entries(updates)) { await this.set(key, value); } — 逐个键更新，每次一个 DB 查询 |
| **Estimated Impact** | 更新 10 个配置需 10 次 DB 往返 |
| **Suggested Fix** | 使用 Prisma 批量更新或单条 UPSERT |
| **Confidence** | 高 |

### QRY-05: Event Listener N+1 — WorkflowNotification

| 字段 | 内容 |
|------|------|
| **File** | workflow-notification.service.ts:46,56,107 |
| **Evidence** | or (const m of managers) { await this.createNotification(...) } — 每个管理者一条 INSERT |
| **Estimated Impact** | 每个审批通过事件+5条INSERT（假设5个管理者） |
| **Suggested Fix** | 使用 createMany 批量插入 |
| **Confidence** | 中 |

---

## P2 Findings

### QRY-06: imageTask.aggregate Called Twice

| 字段 | 内容 |
|------|------|
| **File** | image-tasks.service.ts:28-29 |
| **Evidence** | imageIndex 和 sortOrder 各自调用一次 aggregate |
| **Suggested Fix** | 合并为一次 _max: { imageIndex: true, sortOrder: true } |
| **Confidence** | 高 |
