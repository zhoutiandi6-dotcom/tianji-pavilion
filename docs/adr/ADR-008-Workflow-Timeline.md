# ADR-008: Workflow Timeline & Audit Center

## Status
Approved

## Date
2026-07-02

## Context
The current system tracks workflow state via Prisma directly. There is no immutable history of transitions, no centralized audit trail, and no unified event timeline for users.

## Decision

### 1. Event-Driven History
Every workflow transition publishes a Domain Event via the Event Bus. Two independent listeners create:
- **WorkflowHistory** — Ordered history of all transitions per task
- **AuditEvent** — Centralized audit trail across all resource types

### 2. Immutability
Both WorkflowHistory and AuditEvent are append-only. Records are never updated or deleted.

### 3. Timeline as Aggregation
The Timeline service is a read-only aggregator that combines:
- WorkflowHistory records
- Approval records
- Image task metadata
- (Future: attachment uploads, system events)

No business logic or status modification occurs in the Timeline service.

### 4. Audit as Observer
The Audit module never receives direct calls from business logic. It only listens to Domain Events.

### 5. Event Bus (In-Process)
We continue using the in-process Event Bus rather than Kafka/RabbitMQ to avoid operational complexity at V1 scale. If scaling requires it, the Event Bus can be swapped without changing any listener code.

## Consequences

### Positive
- Complete workflow replay is possible
- Audit trail is automatic and complete
- Timeline can be extended without modifying business logic
- Decoupled architecture allows listeners to be added/removed freely

### Negative
- Event history consumes storage (SQLite, acceptable at V1 scale)
- In-process event bus means listeners block the publisher (acceptable for current volume)

## Future
- AI Explain can analyze WorkflowHistory + AuditEvent
- Dashboard can consume aggregated event data
- External audit exports (JSONL, CSV) can be built on AuditEvent table
