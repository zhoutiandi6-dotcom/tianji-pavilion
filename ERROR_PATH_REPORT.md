# ERROR_PATH_REPORT.md

## Error Path Test Coverage

---

## Error Scenario Coverage Matrix

| Error Scenario | Test Exists? | Test File |
|---------------|-------------|-----------|
| Validation failure (DTO) | ❌ | — |
| Authentication failure (no token) | ❌ | — |
| Authentication failure (expired token) | ❌ | — |
| Authorization failure (wrong role) | ❌ | — |
| Not found (missing resource) | ❌ | — |
| Conflict (duplicate) | ❌ | — |
| Business rule violation (invalid transition) | ❌ | — |
| Database failure | ❌ | — |
| Unexpected exception | ❌ | — |
| Empty input | ❌ | — |
| **Total Error Scenarios** | **10** | **0 tested (0%)** |

## P1 Finding

### ERR-01: Zero Error Path Tests

| 字段 | 内容 |
|------|------|
| **Risk** | 异常路径完全未测试。生产环境中 StateMachine.canTransition() 拒绝非法转换、RolesGuard 拒绝未授权访问等关键安全路径无测试覆盖 |
| **Confidence** | 高 |
| **Priority** | StateMachine illegal transition → Auth unauthorized → Auth forbidden → NotFound |

## ERR-02: Known Exception Filter Gap (from Audit 005-006)

| 字段 | 内容 |
|------|------|
| **Gap** | UnifiedExceptionFilter catches all but (exception instanceof Error) returns raw message |
| **Test** | No test verifies filter behavior |
| **Confidence** | 高 |
