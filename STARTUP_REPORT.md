# STARTUP_REPORT.md

## Startup Process Audit

---

## Startup Sequence (Current)

`
main.ts:
  1. Load .env file
  2. Validate JWT_SECRET exists / not default
  3. Create NestJS app
  4. Global prefix /api
  5. Configure CORS (dev/prod)
  6. Global ValidationPipe
  7. Global ExceptionFilter
  8. Global ResponseInterceptor
  9. Listen on port

docker-entrypoint.sh:
  1. npx prisma generate
  2. npx prisma migrate deploy
  3. npx ts-node prisma/seed.ts
  4. node dist/main.js
`

## P1 Findings

### STP-01: No Dependency Check Before Prisma Migration

| 字段 | 内容 |
|------|------|
| **File** | docker-entrypoint.sh:13 |
| **Evidence** | 
px prisma migrate deploy 运行前未检查数据库是否可连接 |
| **Risk** | 数据库文件挂载卷未就绪时，migrate 静默失败 |
| **Confidence** | 中 |
| **Suggested Fix** | 添加重试循环或健康检查 |

### STP-02: Seed Runs on Every Container Restart

| 字段 | 内容 |
|------|------|
| **File** | docker-entrypoint.sh:16 |
| **Evidence** | seed 脚本使用 upsert，重复执行不会损坏数据，但会覆盖用户手动修改的配置 |
| **Confidence** | 中 |
| **Suggested Fix** | 检查 _prisma_migrations 或环境变量，仅在首次运行时 seed |

## P2 Findings

### STP-03: Frontend Depends on Backend Health in Docker

| 字段 | 内容 |
|------|------|
| **File** | docker-compose.yml:30-32 |
| **Evidence** | depends_on: server: condition: service_healthy |
| **Risk** | 如果 backend health check 超时，frontend 永远不会启动 |
| **Confidence** | 低 — 正常情况不会发生 |

### STP-04: No Graceful Shutdown

| 字段 | 内容 |
|------|------|
| **File** | main.ts |
| **Evidence** | 无 pp.enableShutdownHooks() 调用 |
| **Risk** | Docker stop 时可能无法优雅关闭数据库连接 |
| **Confidence** | 低 — SQLite 关闭通常安全 |
