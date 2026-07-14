# OPERATIONS_REPORT.md

## Operational Readiness Audit

---

## Operational Capabilities

| Capability | Status | Detail |
|-----------|--------|--------|
| Backup | ✅ | scripts/backup.sh — 自动保留 30 天 |
| Restore | ✅ | scripts/restore.sh — 带确认提示 |
| Smoke Test | ✅ | SMOKE_TEST_CHECKLIST.md — 10 类 40 项 |
| Health Check | ✅ | GET /api/health + Docker healthcheck |
| Docker | ✅ | docker-compose.yml |
| Rollback Doc | ✅ | docs/deployment/README.md |
| Graceful Shutdown | ❌ | Main.ts 未调用 pp.enableShutdownHooks() |
| Monitoring | ❌ | 无监控配置 (Prometheus/Grafana) |
| Alerting | ❌ | 无告警配置 |
| PM2/Process Mgr | ❌ | Docker 未配置进程管理 |

## P2 Findings

### OPS-01: No PM2/Process Manager for Non-Docker Deploy

| 字段 | 内容 |
|------|------|
| **Evidence** | start.bat 使用 cmd 窗口启动，关闭窗口会导致服务终止 |
| **Confidence** | 高 |
| **Suggested Fix** | 非 Docker 部署建议使用 PM2 |

### OPS-02: No Monitoring or Alerting

| 字段 | 内容 |
|------|------|
| **Evidence** | 项目未配置监控、指标收集或告警 |
| **Risk** | 低 — V1 内部局域网管理工具 |
| **Confidence** | 高 |
