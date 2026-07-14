# ENVIRONMENT_REPORT.md

## Environment Configuration Audit

---

## Environment Variables

| Variable | .env.example | Default | Required | Secured? |
|----------|-------------|---------|----------|----------|
| SERVER_PORT | 3001 | 3001 | ❌ | ✅ |
| JWT_SECRET | change-me-to-a-random-secret | — | ✅ | ✅ (startup check) |
| JWT_EXPIRES_IN | 7d | 7d | ❌ | ✅ |
| DATABASE_URL | file:./dev.db | file:./dev.db | ❌ | ✅ |
| ALLOWED_ORIGINS | (empty) | — | ❌ | ✅ |
| NEXT_PUBLIC_API_URL | http://localhost:3001/api | — | ✅ | ✅ |
| NODE_ENV | development | development | ❌ | ⚠️ (defaults to dev) |

## P1 Findings

### ENV-01: JWT_SECRET Default Still Shows Example Value

| 字段 | 内容 |
|------|------|
| **File** | .env.example:5 |
| **Evidence** | JWT_SECRET=change-me-to-a-random-secret |
| **Issue** | 如果开发者在 .env.example 基础上直接复制而未修改 JWT_SECRET，main.ts 的启动检查会拒绝启动 |
| **Risk** | 低 — main.ts 已有防护检查 === 'change-me-to-a-random-secret' |
| **Confidence** | 高 |

### ENV-02: ALLOWED_ORIGINS Empty Default in Production Mode

| 字段 | 内容 |
|------|------|
| **File** | main.ts:46-51 |
| **Evidence** | llowedOrigins.length > 0 ? allowedOrigins : false — 空列表时 origin=false |
| **Risk** | 生产模式下未配置 ALLOWED_ORIGINS 会导致所有 CORS 请求被拒绝 |
| **Confidence** | 高 |

### ENV-03: NODE_ENV Not Set in docker-compose.yml

| 字段 | 内容 |
|------|------|
| **File** | docker-compose.yml:12-15 |
| **Evidence** | server service 的 environment 中未设置 NODE_ENV |
| **Risk** | Docker 部署默认以 development 模式运行（CORS 仅允许 localhost） |
| **Confidence** | 高 |
