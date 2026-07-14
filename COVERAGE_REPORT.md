# COVERAGE_REPORT.md

## Test Coverage Estimation

---

## Methodology

Coverage is estimated based on:
1. Number of test files found (**zero**)
2. Number of modules with tests (**zero**)
3. Module complexity (lines of code, branches, dependencies)

## Coverage Estimation

| Coverage Type | Estimated % | Details |
|--------------|-------------|---------|
| Line Coverage (Backend) | **0%** | 0 tests for ~15,000 lines |
| Line Coverage (Frontend) | **0%** | 0 tests for ~5,000 lines |
| Branch Coverage | **0%** | No conditional branch testing |
| Function Coverage | **0%** | No function-level testing |
| **Overall** | **0%** | |

## Completely Untested Modules

| Module | Files | LOC (approx) |
|--------|-------|-------------|
| auth | 4 | 400 |
| users | 4 | 400 |
| tasks | 5 | 400 |
| image-tasks | 5 | 350 |
| workflow-engine | 5 | 350 |
| workflow-history | 2 | 60 |
| workflow-notification | 2 | 130 |
| audit | 4 | 140 |
| timeline | 3 | 120 |
| announcement | 4 | 180 |
| system-config | 4 | 120 |
| stores | 4 | 100 |
| requirement-types | 4 | 100 |
| notifications | 3 | 80 |
| approval | 4 | 100 |
| attachments | 3 | 60 |
| dashboard | 2 | 80 |
| health | 2 | 20 |
| operation-log | 3 | 80 |
| roles-permissions | 3 | 70 |
| event-bus | 2 | 40 |
| domain-events | 1 | 60 |
| common | 6 | 200 |
| **Total** | **~73** | **~3,640** |

## P0 Finding

### CVG-01: Zero Test Coverage Across Entire Project

| 字段 | 内容 |
|------|------|
| **Risk** | 100% of production code has zero automated test coverage |
| **Confidence** | 高 |
| **Qualifier** | 覆盖率估算基于文件存在性，未使用 Istanbul/Jest 实际计算，但结果无可争议 |
