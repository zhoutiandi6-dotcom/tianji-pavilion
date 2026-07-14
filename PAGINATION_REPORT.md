# PAGINATION_REPORT.md

## Pagination Audit

---

## Endpoints with Pagination

| Endpoint | Implementation | Page Size | Max Page Size |
|----------|---------------|-----------|---------------|
| GET /api/tasks | ✅ skip/take | 20 (default) | ❌ No max |
| GET /api/notifications | ✅ skip/take | 20 (default) | ❌ No max |
| GET /api/announcements | ✅ skip/take | 20 (default) | ❌ No max |
| GET /api/audit | ✅ skip/take | 50 (default) | ❌ No max |
| GET /api/operation-logs | ✅ skip/take | 50 (default) | ❌ No max |

## Endpoints WITHOUT Pagination

| Endpoint | File | Risk |
|----------|------|------|
| GET /api/stores | stores.service.ts:11 | 🟢 低 — 小表 (<10条) |
| GET /api/requirement-types | requirement-types.service.ts:11 | 🟢 低 — 小表 (<10条) |
| GET /api/roles-permissions/roles | roles-permissions.service.ts:9 | 🟢 低 — 小表 (7条) |
| GET /api/roles-permissions/permissions | roles-permissions.permission.service.ts | 🟢 低 — 小表 (<50条) |
| GET /api/users | users.service.ts:16 | 🟡 中 — 用户数可达上千,无限制 |

## P1 Finding

### PAG-01: No Maximum Page Size Enforcement

| 字段 | 内容 |
|------|------|
| **Risk** | 任意客户端可请求 ?pageSize=100000 加载全部数据 |
| **Affected Endpoints** | tasks, notifications, announcements, audit, operation-logs |
| **Fix** | 在所有分页服务中添加 pageSize = Math.min(pageSize, 100) |
| **Confidence** | 高 |

### PAG-02: Users List Missing Pagination

| 字段 | 内容 |
|------|------|
| **File** | users.service.ts:16 |
| **Evidence** | 	his.prisma.user.findMany({ include: { role: true } }) — 无 skip/take |
| **Impact** | 1000 用户时加载全部数据 |
| **Fix** | 添加分页参数 |
| **Confidence** | 中 |
