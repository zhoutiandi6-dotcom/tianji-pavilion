# PRISMA_SCHEMA_REPORT.md

## Prisma Schema Review

---

## Models (16)

| Model | PK | Indexes | Relations |
|-------|----|---------|-----------|
| User | id (auto) | roleId | Role, Task, ImageTask, ApprovalRecord, OperationLog, Attachment, Announcement |
| Role | id (auto) | — | User, RolePermission |
| Permission | id (auto) | (action,resource) UNIQUE | RolePermission |
| RolePermission | (roleId,permissionId) composite | — | Role, Permission |
| Task | id (auto) | creatorId, storeId, requirementTypeId, deadline, workflowStatus, createdAt | User, Store, RequirementType, ApprovalRecord, ImageTask |
| ImageTask | id (auto) | taskId, designerId, status, createdAt | Task, User, Attachment |
| ApprovalRecord | id (auto) | taskId, approverId | Task, User |
| Attachment | id (auto) | imageTaskId, uploadedById, deletedAt | ImageTask, User |
| Notification | id (auto) | receiverId, isRead, createdAt | — |
| OperationLog | id (auto) | userId, createdAt, targetType, action | User |
| SystemConfig | id (auto) | key (UNIQUE) | — |
| Store | id (auto) | name (UNIQUE), code (UNIQUE) | Task |
| RequirementType | id (auto) | name (UNIQUE) | Task |
| Announcement | id (auto) | creatorId, isPublished, deletedAt | User |
| WorkflowHistory | id (auto) | workflowId, eventType, createdAt | — |
| AuditEvent | id (auto) | resourceType, resourceId, action, createdAt | — |

## Findings

### P2: No Cascade Delete Rules

| 字段 | 内容 |
|------|------|
| **Evidence** | Prisma 模型未定义 onDelete: Cascade |
| **Impact** | 删除 User 时，其关联的 Task/ImageTask 不会被自动删除 |
| **Mitigation** | 业务层手动处理删除（如 TasksService.remove 先删 imageTask 再删 task） |
| **Suggested Fix** | 对 ImageTask → Task 添加 onDelete: Cascade |

---

## Verdict

Schema 设计合理，索引覆盖了所有外键和常用查询字段。
缺少 cascade 删除规则但业务层已手动处理。
