# 天机阁 V1 — Code Review Info

## Current Version
**V1.0.0 RC Final**

## Completed RFCs

| RFC | Title | Status |
|-----|-------|--------|
| Sprint 0-3 | Architecture, JWT/RBAC, Task CRUD | ✅ |
| Sprint 4-5 | Business Model, Workflow, Approval | ✅ |
| Sprint 5.2 | RBAC & Permission Alignment | ✅ |
| Sprint 6 | Enterprise Workspace, Dark Mode | ✅ |
| Sprint 7 | Tianji Design Language | ✅ |
| Milestone A | Owner, SystemConfig, Login Lockout | ✅ |
| Beta Prep | RBAC Refactoring (isOwner removed) | ✅ |
| RC-1 Infra | Error Codes, Logger, Request ID, Response Interceptor | ✅ |
| Workflow Engine | State Machine, Event Bus, Domain Events | ✅ |
| RFC-008 | Workflow Timeline, History, Audit Center | ✅ |
| RFC-009 | Release Hardening, Unit Tests, Backup Scripts | ✅ |
| RFC-010 | Architecture Cleanup, OpLog→Audit, SystemConfig Versioning | ✅ |
| **RFC-011** | **Release Candidate Final** | **This sprint** |

## Database (17 tables)

users, roles, permissions, role_permissions, stores, requirement_types,
tasks, image_tasks, attachments, approval_records, notifications,
operation_logs (deprecated), system_configs, announcements,
workflow_history, audit_events, _prisma_migrations

## Architecture Changes (RFC-011)

1. **Operation Log retired** — All log writes redirected to `audit_events` table
2. **Workflow Engine finalized** — Single lifecycle manager for all status transitions
3. **OperationLogService preserved as migration shim** — Existing callers unchanged, data goes to audit_events
4. **Backup scripts** — `scripts/backup.sh` + `scripts/restore.sh` with auto-rotation
5. **Technical debt documented** — `TECHNICAL_DEBT.md`

## Known Issues (V1 → V2)

1. Notification auto-triggers incomplete
2. Attachment upload UI not wired
3. Error pages removed (Next.js 14 static export conflict)
4. ESLint v10 incompatibility with Next.js 14
5. SQLite not suitable for production scale

## Review Focus

- **Workflow Engine** as single lifecycle manager
- **Event-driven architecture** (Domain Events → Event Bus → Listeners)
- **State Machine** validation of all transitions
- **RBAC** four-layer consistency (menu, page, API, data)
- **Audit Center** as single source of truth for event history
- **Event Bus** decoupling business modules from side effects

## Next Sprint (V2)

- Notification auto-triggers (complete wiring)
- Attachment upload UI
- User activation flow
- ImageTask drag-sort
- AI features (ABIP)
- PostgreSQL migration
