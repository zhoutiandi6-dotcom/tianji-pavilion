# 天机阁 V1 Architecture Decisions

## Overview
This document tracks all architecture decisions made during the V1 development cycle.

## Domains

### Core Domains
| Module | Responsibility |
|--------|---------------|
| `auth/` | JWT authentication, RBAC roles, login lockout |
| `users/` | User CRUD, Owner protection, activation |
| `tasks/` | Task (法旨) CRUD |
| `image-tasks/` | Image task lifecycle |
| `approval/` | Approval workflow (thin wrapper over WorkflowEngine) |
| `stores/` | Store management |
| `requirement-types/` | Requirement type management |

### Workflow Domains (RFC-008)
| Module | Responsibility |
|--------|---------------|
| `workflow-engine/` | Centralized state machine + transition validation |
| `workflow-history/` | Immutable transition history (event-driven) |
| `timeline/` | Read-only event aggregation API |
| `audit/` | Immutable audit trail (event-driven) |

### Infrastructure Domains
| Module | Responsibility |
|--------|---------------|
| `event-bus/` | In-process publish/subscribe event bus |
| `domain-events/` | Domain event class definitions |
| `common/` | Exception filter, response interceptor, error codes, logger |
| `operation-log/` | Business operation log |
| `system-config/` | Key-value system configuration |

### Communication Domains
| Module | Responsibility |
|--------|---------------|
| `notifications/` | User notification CRUD |
| `workflow-notification/` | Event-driven notification generation |
| `announcement/` | System announcements, Owner-only publish |

## Database

### SQLite + Prisma
- SQLite is used for V1 (simplicity, zero-config)
- Prisma ORM with TypeScript-first schema
- All enums stored as String (SQLite limitation)
- Soft delete via `deletedAt` on all major entities

### Immutable Tables
Two tables must never be updated or deleted:
1. `workflow_history`
2. `audit_events`

## Key Decisions

### Event Bus over Message Queue
In-process Event Bus avoids external dependencies at V1 scale.
If needed, migration path: same event structure, swap transport.

### Workflow Engine is the Only State Manager
No controller or service may directly mutate workflow status.
All transitions must pass through `WorkflowEngine.transition()`.

### No External AI in V1
AI features (ABIP, image analysis, explanation) are deferred to V2.

## Migration Notes

### Adding a New Workflow State
1. Add state to State Machine transition map
2. Add event class (optional, if new transition type)
3. Add listener handler in workflow-history + audit
4. Update Timeline event label map

### Adding a New Event Listener
1. Create listener class
2. Subscribe to events in constructor via `this.eventBus.subscribe()`
3. Register module in `app.module.ts`
