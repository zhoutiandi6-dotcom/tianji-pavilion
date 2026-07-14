# DEPLOYMENT_FIX_REPORT.md

## Version
v1.0.0-audit-008-fix

---

## Fix 1: Seed Execution Control

| 字段 | 内容 |
|------|------|
| **Issue** | docker-entrypoint.sh 每次启动自动执行 seed |
| **Previous** | 无条件的 
px ts-node prisma/seed.ts |
| **New** | if [ \"\\" = \"true\" ] 控制 |
| **Files** | pps/server/docker-entrypoint.sh, .env.example, docker-compose.yml |

## Fix 2: Database Startup Readiness

| 字段 | 内容 |
|------|------|
| **Issue** | migrate 执行前未检查数据库是否可连接 |
| **Previous** | 直接执行 
px prisma migrate deploy |
| **New** | 循环检查文件存在性，最多等待 30 秒，超时后继续尝试 |
| **Files** | pps/server/docker-entrypoint.sh |

## Fix 3: Graceful Shutdown

| 字段 | 内容 |
|------|------|
| **Issue** | 无优雅关闭支持 |
| **Previous** | 无 |
| **New** | pp.enableShutdownHooks() — 接收 SIGTERM 后关闭 DB 连接 |
| **Files** | pps/server/src/main.ts |

## Fix 4: Deployment Documentation

| 字段 | 内容 |
|------|------|
| **Updated** | ALLOWED_ORIGINS, NODE_ENV, RUN_SEED env vars; 启动序列; 优雅关闭说明; 部署验证命令 |
| **Files** | docs/deployment/README.md |

## Fix 5: docker-compose.yml

| 字段 | 内容 |
|------|------|
| **Updated** | 新增 NODE_ENV=production, RUN_SEED=false |
| **Files** | docker-compose.yml |

## Modified Files

| # | File | Change |
|---|------|--------|
| 1 | apps/server/docker-entrypoint.sh | RUN_SEED 控制 + DB 就绪检查 |
| 2 | apps/server/src/main.ts | enableShutdownHooks |
| 3 | docker-compose.yml | NODE_ENV + RUN_SEED |
| 4 | .env.example | RUN_SEED 变量 |
| 5 | docs/deployment/README.md | 完整更新 |
