# TIMELINE_REPORT.md

## Timeline Audit

---

## Finding

### TML-01: Timeline Duplicates Every Event (P1 - Critical)

| 字段 | 内容 |
|------|------|
| **File** | `apps/server/src/timeline/timeline.service.ts` |
| **Evidence** | Timeline 使用**三套独立数据源**： |

**数据源 1**: 硬编码创建事件
```typescript
// Line 13-20: 手动创建的合成事件
events.push({ id: -1, event: "WorkflowCreated", label: "创建法旨" });
```

**数据源 2**: WorkflowHistory 记录（自动记录的所有事件）
```typescript
// Line 22-32: 读取 workflow_history 表
const history = await this.prisma.workflowHistory.findMany(...);
```

**数据源 3**: ApprovalRecords 表（直接读取审批记录）
```typescript
// Line 34-58: 读取 approval_records 表
const approvals = await this.prisma.approvalRecord.findMany(...);
```

**结果**: 每个事件出现两次：
- 创建法旨 → 出现在数据源1 (WorkflowCreated) + 数据源2 (workflow.created)
- 审批通过 → 出现在数据源2 (workflow.approved) + 数据源3 (approval_records)
- 审核通过 → 出现在数据源2 (image_task.review_approved) + 无其他来源 (✅ 唯一)

### TML-02: Timeline Operator Field Incomplete (P2)

| 字段 | 内容 |
|------|------|
| **File** | `timeline.service.ts:37` |
| **Evidence** | WorkflowHistory 的 `operator` 被硬编码为 `"系统"`，没有从 workflowHistory 的 `operatorId` 查询用户名 |
| **Confidence** | 高 |

## Suggested Fix for TML-01

Timeline 应只从 `workflowHistory` + `imageTasks` 读取数据，**移除**:
1. 硬编码的创建事件（workflowHistory 已有 `workflow.created`）
2. approval_records 直接查询（workflowHistory 已有 `workflow.approved` / `workflow.rejected`）

修改后：`workflowHistory(7+种事件) + imageTasks(图片创建事件)` = 完整无重复

