# EVENT_LIST.md

## All Domain Events

| # | Event | Class | Published By | Subscribers | Used? |
|---|-------|-------|-------------|-------------|-------|
| 1 | workflow.created | WorkflowCreated | tasks.service.ts (create) | Audit, WorkflowHistory | ✅ |
| 2 | workflow.submitted | WorkflowSubmitted | WorkflowEngine (submit) | WorkflowNotification, WorkflowHistory, Audit | ✅ |
| 3 | workflow.withdrawn | WorkflowWithdrawn | WorkflowEngine (withdraw) | WorkflowNotification, Audit, WorkflowHistory | ✅ |
| 4 | workflow.approved | WorkflowApproved | WorkflowEngine (approve) | WorkflowNotification, WorkflowHistory, Audit | ✅ |
| 5 | workflow.rejected | WorkflowRejected | WorkflowEngine (reject) | WorkflowNotification, WorkflowHistory, Audit | ✅ |
| 6 | workflow.completed | WorkflowCompleted | WorkflowEngine (recalcTaskStatus) | WorkflowNotification, WorkflowHistory, Audit | ✅ |
| 7 | workflow.archived | WorkflowArchived | **Never published** | WorkflowHistory, Audit | ❌ |
| 8 | image_task.started | ImageTaskStarted | image-tasks.service.ts (update) | WorkflowHistory, Audit | ✅ |
| 9 | image_task.submitted_for_review | ImageTaskSubmittedForReview | image-tasks.service.ts (update) | WorkflowHistory, Audit | ✅ |
| 10 | image_task.review_approved | ImageTaskReviewApproved | image-tasks.service.ts (update) | WorkflowNotification, WorkflowHistory, Audit | ✅ |
| 11 | image_task.review_rejected | ImageTaskReviewRejected | image-tasks.service.ts (update) | WorkflowNotification, WorkflowHistory, Audit | ✅ |
| 12 | image_task.assigned | ImageTaskAssigned | image-tasks.service.ts (update) | WorkflowNotification, WorkflowHistory, Audit | ✅ |
| 13 | task.updated | TaskUpdated | **Never published** | Audit | ❌ |

## Missing Events (Not Defined)

| Missing Event | Suggested For |
|--------------|---------------|
| task.deleted | tasks.service.ts remove() |
| announcement.created | announcement.service.ts create/publish |
| user.created | users.service.ts create |
| user.login | auth.service.ts login |
| user.password_changed | auth.service.ts changePassword |

