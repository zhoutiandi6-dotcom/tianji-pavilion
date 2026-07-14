# HEALTHCHECK_REPORT.md

## Health Check Audit

---

## Health Endpoint

| 字段 | 内容 |
|------|------|
| **Path** | GET /api/health |
| **File** | pps/server/src/health/health.controller.ts |
| **Auth** | ❌ Public (无认证) — ✅ 正确的设计 |
| **Checks** | 数据库连接检查 ✅ |
| **Response (healthy)** | { status: "ok", database: "connected", timestamp } |
| **Response (unhealthy)** | { status: "error", database: "disconnected", timestamp } |

## Docker Healthcheck

| 字段 | 内容 |
|------|------|
| **File** | docker-compose.yml:20-25 |
| **Command** | wget --no-verbose --tries=1 --spider http://localhost:3001/api/health |
| **Interval** | 30s |
| **Timeout** | 10s |
| **Retries** | 3 |
| **Start Period** | 30s |

## P2 Findings

### HCK-01: Health Check Doesn't Verify Database Write

| 字段 | 内容 |
|------|------|
| **Evidence** | Health check 仅执行 SELECT 1 读操作，无法检测数据库写不可用问题 |
| **Confidence** | 低 — SQLite 读写相同，读可用即写可用 |

### HCK-02: No Liveness/Readiness Separation

| 字段 | 内容 |
|------|------|
| **Evidence** | 单个 /api/health 端点同时用于 liveness 和 readiness |
| **Confidence** | 低 — V1 内部部署无需区分 |
