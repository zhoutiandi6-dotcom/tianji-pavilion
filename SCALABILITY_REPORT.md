# SCALABILITY_REPORT.md

## Query Scalability Audit

---

## Methodology

估算每个主要查询在 100K / 500K / 1M 记录下的行为。

---

## Scalability Impact Matrix

| Query | File | 100K | 500K | 1M | Bottleneck |
|-------|------|------|------|----|------------|
| Dashboard (18 counts) | dashboard.controller.ts | 🟢 ~800ms | 🟡 ~3s | 🔴 ~6s | 全表 count 扫描 |
| Tasks list with WHERE | tasks.service.ts | 🟢 ~50ms | 🟡 ~200ms | 🟡 ~400ms | 索引扫描 |
| Tasks findOne (deep) | tasks.service.ts | 🟢 ~20ms | 🟢 ~30ms | 🟢 ~50ms | 主键查询 |
| Notifications per user | notifications.service.ts | 🟢 ~10ms | 🟢 ~20ms | 🟢 ~30ms | 索引(receiverId) |
| Operation Log list | operation-log.service.ts | 🟢 ~100ms | 🟡 ~500ms | 🟡 ~1s | 全页排序 |
| Timeline per task | timeline.service.ts | 🟢 ~5ms | 🟢 ~10ms | 🟢 ~15ms | 索引(workflowId, taskId) |
| Audit list | audit controller | 🟢 ~100ms | 🟡 ~500ms | 🟡 ~1s | 全页排序 |
| Users list | users.service.ts | 🟢 ~10ms | 🟢 ~20ms | 🟢 ~30ms | 全表扫描，但用户数通常 < 100 |

## P1 Finding

### SCL-01: Dashboard at 1M Records

| 字段 | 内容 |
|------|------|
| **File** | dashboard.controller.ts |
| **Evidence** | 18 个 count() 查询，每个都需要全表扫描或索引范围扫描 |
| **Estimated Time** | 1M 记录时约 3-6 秒 |
| **Suggested Fix** | 设计聚合表 + 缓存层；或合并为单一 SQL 查询 |
| **Blocking** | 否 — V1 内部局域网 1K-10K 记录远低于此阈值 |
| **Confidence** | 高 |

## P2 Finding

### SCL-02: SQLite Write Concurrency

| 字段 | 内容 |
|------|------|
| **Issue** | SQLite 写操作全局锁，并发写入超过 10 QPS 时出现延迟 |
| **Impact** | V1 内部局域网 < 10 并发用户，不会触发此问题 |
| **Recommendation** | V2 迁移到 PostgreSQL |

---

## Summary

| Threshold | Status | Action Needed |
|-----------|--------|---------------|
| 1,000 records | ✅ 无问题 | 无 |
| 10,000 records | ✅ 无问题 | 无 |
| 100,000 records | 🟡 可接受 | Dashboard 优化 (P2) |
| 500,000 records | 🔴 需要优化 | SQLite → PostgreSQL + Dashboard 缓存 |
| 1,000,000 records | 🔴 需要优化 | 同上 |
