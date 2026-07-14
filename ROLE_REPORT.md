# ROLE_REPORT.md

## Role Usage Report

---

## Role Enum State

**No centralized Role enum exists in the server codebase.**

The packages/types/src/index.ts defines UserRole enum but it is only used for JwtPayload type.
All role comparisons in server code use **hardcoded string literals**.

---

## Hardcoded Role References

| Role | Count | Files |
|------|-------|-------|
| "OWNER" | 13 | auth.service, users.service, users.controller, system-config.controller, workflow-engine, announcement.service |
| "SUPER_ADMIN" | 5 | users.controller, system-config.controller, tasks.service |
| "OPERATION_MANAGER" | 2 | approval.service (via WorkflowEngine) |
| "DESIGN_MANAGER" | 3 | image-tasks.service, tasks.service |
| "OPERATION" | 5 | tasks.service, approval.service |
| "DESIGNER" | 3 | image-tasks.service, tasks.service |

**Total: 31 hardcoded role references across 12 files**

---

## Risk

- **Maintenance risk**: Renaming a role requires modifying all 12 files
- **Consistency risk**: No single source of truth for role names
- **Typo risk**: A mistyped role string will silently fail (return false instead of correct result)

## Recommendation

1. Export Role enum from packages/types or common/enums
2. Replace all "OWNER" with UserRole.OWNER
3. Use TypeScript to catch any misspelled role names at compile time
