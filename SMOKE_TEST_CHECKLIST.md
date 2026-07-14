# SMOKE_TEST_CHECKLIST.md

## Version
v1.0.0

## Purpose
Repeatable release verification checklist.
Complete before every deployment.

---

## 1. Application Startup

- [ ] Backend starts: cd apps/server && npm run start:prod
- [ ] Frontend starts: cd apps/web && npm run build && npm start
- [ ] GET /api/health returns { status: "ok", database: "connected" }

## 2. Authentication

- [ ] POST /api/auth/login with valid credentials returns 200 + accessToken
- [ ] POST /api/auth/login with invalid credentials returns 401
- [ ] GET /api/auth/me with valid token returns user info + role
- [ ] GET /api/auth/me without token returns 401
- [ ] GET /api/auth/init-status returns { initialized: true }

## 3. Workflow: Full Lifecycle

### 3.1 Create (as OPERATOR)
- [ ] POST /api/tasks creates task with workflowStatus = "DRAFT"
- [ ] GET /api/tasks returns the created task in list

### 3.2 Submit (as OPERATOR — same creator)
- [ ] POST /api/tasks/1/approval/submit → workflowStatus = "PENDING_APPROVAL"

### 3.3 Approve (as OPERATION_MANAGER)
- [ ] POST /api/tasks/1/approval/approve → workflowStatus = "APPROVED"
- [ ] Approval record created
- [ ] WorkflowHistory entry created

### 3.4 ImageTask (as OPERATOR)
- [ ] POST /api/image-tasks creates image task with status "NOT_STARTED"

### 3.5 Start Making (as DESIGNER)
- [ ] POST /api/image-tasks/1/start → status "IN_PROGRESS"
- [ ] Task workflowStatus auto-recalculated

### 3.6 Submit Review (as DESIGNER)
- [ ] POST /api/image-tasks/1/submit-review → status "PENDING_DESIGN_REVIEW"

### 3.7 Approve Review (as DESIGN_MANAGER)
- [ ] POST /api/image-tasks/1/approve-review → status "COMPLETED"
- [ ] Task workflowStatus = "COMPLETED" (all tasks done)

## 4. Timeline

- [ ] GET /api/timeline/task/1 returns chronological event list
- [ ] Events include: WorkflowCreated, submitted, approved, image_task events
- [ ] No duplicate entries

## 5. Audit

- [ ] GET /api/audit returns audit event list
- [ ] Events include create_task, submit_approval, approve_task

## 6. Announcement (as OWNER)

- [ ] POST /api/announcements creates announcement
- [ ] POST /api/announcements/1/publish publishes it
- [ ] GET /api/announcements lists published announcements
- [ ] POST /api/announcements as OPERATOR returns 403

## 7. System Config

- [ ] GET /api/system-config returns all config keys
- [ ] PUT /api/system-config with valid body updates config
- [ ] GET /api/system-config/site_name/history returns version info

## 8. User Management (as OWNER/SUPER_ADMIN)

- [ ] GET /api/users returns user list
- [ ] POST /api/users creates new user (default: inactive)
- [ ] POST /api/users/:id/activate activates user
- [ ] POST /api/users/:id/deactivate deactivates user
- [ ] POST /api/users/:id/reset-password resets password

## 9. RBAC Verification

- [ ] DESIGNER cannot create task → 403
- [ ] OPERATION cannot approve → 403
- [ ] OPERATION_MANAGER cannot manage users → 403
- [ ] GUEST cannot login → 401

## 10. Permission Denied

- [ ] Unauthenticated request → 401
- [ ] Insufficient role → 403
- [ ] Missing resource → 404
- [ ] Duplicate resource → 409

---

## Pre-Release Sign-off

| Check | Pass/Fail | Tester | Date |
|-------|-----------|--------|------|
| 1. Startup | | | |
| 2. Auth | | | |
| 3. Workflow Full Lifecycle | | | |
| 4. Timeline | | | |
| 5. Audit | | | |
| 6. Announcement | | | |
| 7. System Config | | | |
| 8. User Management | | | |
| 9. RBAC | | | |
| 10. Errors | | | |

**Release Decision**: [ ] Approve [ ] Reject [ ] Conditional
