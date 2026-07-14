# BUSINESS_FLOW_REPORT.md

## Critical Business Flow Test Coverage

---

## Flow Coverage Matrix

| Business Flow | Test Exists? | Test File |
|--------------|-------------|-----------|
| Workflow Create (DRAFT) | ❌ | — |
| Workflow Submit (→ PENDING_APPROVAL) | ❌ | — |
| Workflow Withdraw (→ DRAFT) | ❌ | — |
| Workflow Approve (→ APPROVED) | ❌ | — |
| Workflow Reject (→ REJECTED) | ❌ | — |
| Workflow Complete | ❌ | — |
| ImageTask Start | ❌ | — |
| ImageTask Submit Review | ❌ | — |
| ImageTask Approve Review | ❌ | — |
| ImageTask Reject Review | ❌ | — |
| Assign Designer | ❌ | — |
| Task Create | ❌ | — |
| Task Update | ❌ | — |
| Task Delete | ❌ | — |
| Announcement Create | ❌ | — |
| Announcement Publish | ❌ | — |
| Announcement Toggle Pin | ❌ | — |
| User Login | ❌ | — |
| User Change Password | ❌ | — |
| User Create (by Admin) | ❌ | — |
| User Activate | ❌ | — |
| User Deactivate | ❌ | — |
| SystemConfig Update | ❌ | — |
| Role Assignment | ❌ | — |
| **Critical Flows Total** | **24** | **0 tested (0%)** |

## P1 Finding

### BFL-01: 24 Critical Business Flows — Zero Automated Tests

| 字段 | 内容 |
|------|------|
| **Risk** | 每次修改需要完整手动回归测试。无法自动检测回归。 |
| **Confidence** | 高 |
| **Priority Recommendation** | StateMachine (pure logic, easy to mock) → WorkflowEngine (service) → Auth (JWT) → Tasks → Announcements |
