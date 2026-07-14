# INDEX_REPORT.md

## Database Index Audit

---

## Current Indexes

| Table | Fields | Indexed? | Type |
|-------|--------|----------|------|
| tasks | creatorId | ✅ | INDEX |
| tasks | storeId | ✅ | INDEX |
| tasks | requirementTypeId | ✅ | INDEX |
| tasks | deadline | ✅ | INDEX |
| tasks | workflowStatus | ✅ | INDEX |
| tasks | createdAt | ✅ | INDEX |
| image_tasks | taskId | ✅ | INDEX |
| image_tasks | designerId | ✅ | INDEX |
| image_tasks | status | ✅ | INDEX |
| image_tasks | createdAt | ✅ | INDEX |
| notifications | receiverId | ✅ | INDEX |
| notifications | isRead | ✅ | INDEX |
| notifications | createdAt | ✅ | INDEX |
| operation_logs / audit_events | userId/operatorId | ✅ | INDEX |
| operation_logs / audit_events | createdAt | ✅ | INDEX |
| operation_logs / audit_events | targetType | ✅ | INDEX |
| operation_logs / audit_events | action | ✅ | INDEX |
| workflow_history | workflowId | ✅ | INDEX |
| workflow_history | eventType | ✅ | INDEX |
| workflow_history | createdAt | ✅ | INDEX |
| audit_events | resourceType | ✅ | INDEX |
| audit_events | resourceId | ✅ | INDEX |
| audit_events | action | ✅ | INDEX |
| audit_events | createdAt | ✅ | INDEX |
| announcements | creatorId | ✅ | INDEX |
| announcements | isPublished | ✅ | INDEX |
| announcements | deletedAt | ✅ | INDEX |
| users | roleId | ✅ | INDEX |
| attachments | imageTaskId | ✅ | INDEX |
| attachments | uploadedById | ✅ | INDEX |
| attachments | deletedAt | ✅ | INDEX |
| approval_records | taskId | ✅ | INDEX |
| approval_records | approverId | ✅ | INDEX |
| permissions | (action, resource) | ✅ | UNIQUE |

---

## P2 Findings

### IDX-01: Missing Composite Index on tasks (priority, deadline, createdAt)

| 字段 | 内容 |
|------|------|
| **Reason** | 法旨列表默认排序 ORDER BY priority DESC, deadline ASC, createdAt DESC — 覆盖3个字段 |
| **Current** | 3 个独立索引 |
| **Suggested Fix** | @@index([priority, deadline, createdAt]) |
| **Confidence** | 中 — SQLite 对复合索引提升有限 |

### IDX-02: Missing Index on SystemConfig (version, updatedBy)

| 字段 | 内容 |
|------|------|
| **Reason** | 版本追踪字段新增后未加索引 |
| **Current** | 仅有 key UNIQUE 索引 |
| **Suggested Fix** | 小表 (<100条)，不需要加索引 |
| **Confidence** | 低 |

---

## Conclusion

当前索引设计合理，所有外键和常用查询字段都已建索引。
SQLite 存储引擎的索引优化空间有限。
