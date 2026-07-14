# EDGE_CASE_REPORT.md

## Edge Case Test Coverage

---

## Edge Case Matrix

| Edge Case | Test Exists? | Notes |
|-----------|-------------|-------|
| Empty input (task with no title) | ❌ | DTO validation but no test |
| Large input (10MB attachment) | ❌ | No file size limit test |
| Duplicate submission (approve twice) | ❌ | StateMachine should reject |
| Concurrent request (2 users same task) | ❌ | SQLite serialized, no test |
| Repeated approval (same user) | ❌ | Should create 2nd approval record? |
| Deleted resources (access deleted task) | ❌ | Should return 404 |
| Serial number overflow (999999 to 1000000) | ❌ | Format \"天字第1000000号法旨\" |
| Empty workflow history | ❌ | Timeline should handle |
| User with 100 image tasks | ❌ | Performance boundary |
| Owner attempting self-edit | ❌ | Protected path |

## P2 Finding

### EDG-01: Zero Edge Case Tests

| 字段 | 内容 |
|------|------|
| **Risk** | 边界条件完全依赖极端场景的实际用户报错。 |
| **Confidence** | 中 — 部分边界条件（如空输入）已被 DTO ValidationPipe 覆盖 |
| **Priority** | Duplicate approval → Deleted resource access → Serial overflow |
