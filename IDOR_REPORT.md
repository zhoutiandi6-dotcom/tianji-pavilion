# IDOR_REPORT.md

## Insecure Direct Object Reference Report

---

## IDOR P1

### IDOR-01: Tasks findOne — No Ownership Check

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/tasks/tasks.controller.ts:17 (line) |
| **Endpoint** | GET /api/tasks/:id |
| **Evidence** | 控制器将请求转发给 	his.service.findOne(id) 但**不传入 userId** |
| **Service** | 	asks.service.ts:findOne() 没有任何 userId 参数 |
| **Risk** | 设计师可以查看任意法旨详情，包括 DRAFT 和 PENDING_APPROVAL 状态的 |
| **Fix** | 在 findOne 中根据 userRole 过滤可见性 |

### IDOR-02: Approval Records — No Ownership Check

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/approval/approval.controller.ts:16 |
| **Endpoint** | GET /api/tasks/:taskId/approval/records |
| **Evidence** | 直接查询 db 返回，无任何用户上下文检查 |
| **Risk** | 任何登录用户可以查看任意法旨的审批记录 |
| **Fix** | 检查请求者是否是该任务的参与者或管理者 |

### IDOR-03: ImageTask findByTask — No Ownership Check

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/image-tasks/image-tasks.controller.ts:8 |
| **Endpoint** | GET /api/image-tasks/by-task/:taskId |
| **Risk** | 设计师可以列出任意法旨的图片任务 |
| **Fix** | 添加 designerId 匹配检查 |

## IDOR P2

### IDOR-04: Timeline — No Ownership Check

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/timeline/timeline.controller.ts:12 |
| **Endpoint** | GET /api/timeline/task/:taskId |
| **Risk** | 任意登录用户可以查看任意法旨的时间线 |

### IDOR-05: ImageTask findOne — No Ownership Check

| 字段 | 内容 |
|------|------|
| **File** | pps/server/src/image-tasks/image-tasks.controller.ts:9 |
| **Endpoint** | GET /api/image-tasks/:id |
| **Risk** | 任意登录用户可以查看任意图片任务详情 |

## Summary

| # | Endpoint | Risk | Check? |
|---|----------|------|--------|
| 1 | GET /api/tasks/:id | 🔴 P1 | ❌ |
| 2 | GET /api/tasks/:taskId/approval/records | 🔴 P1 | ❌ |
| 3 | GET /api/image-tasks/by-task/:taskId | 🔴 P1 | ❌ |
| 4 | GET /api/timeline/task/:taskId | 🟡 P2 | ❌ |
| 5 | GET /api/image-tasks/:id | 🟡 P2 | ❌ |
