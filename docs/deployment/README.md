# 天机阁 V1 部署指南

## 环境要求

- Node.js 22 LTS+
- Docker + Docker Compose (推荐)
- npm 10+

---

## 环境变量

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `SERVER_PORT` | 后端端口 | 3001 | 否 |
| `DATABASE_URL` | 数据库路径 | `file:./prisma/dev.db` | 否 |
| `JWT_SECRET` | JWT 密钥 | **无默认值** | **是** |
| `JWT_EXPIRES_IN` | Token 过期时间 | `7d` | 否 |
| `NEXT_PUBLIC_API_URL` | 前端 API 地址 | `http://localhost:3001/api` | **是** |
| `ALLOWED_ORIGINS` | 生产 CORS 白名单 (逗号分隔) | `(空)` | 否(生产必填) |
| `NODE_ENV` | 环境 (development/production) | `development` | 否 |
| `RUN_SEED` | Docker 启动时执行种子数据 | `false` | 否 |

---

## Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone <repository-url>
cd tianji-pavilion

# 2. 复制环境变量
cp .env.example apps/server/.env
# 编辑 .env 设置 JWT_SECRET，以及生产环境的 ALLOWED_ORIGINS

# 3. 启动
# 生产环境:
NODE_ENV=production ALLOWED_ORIGINS=https://yourdomain.com docker compose up -d

# 开发环境:
docker compose up -d

# 4. 查看日志
docker compose logs -f

# 5. 访问
# 前端: http://localhost:3000
# 后端: http://localhost:3001/api
```

### Docker 启动序列

```
1. 检查数据库文件就绪 (最多等待 30 秒)
2. npx prisma generate   — 生成 Prisma Client
3. npx prisma migrate deploy — 执行数据库迁移
4. [可选] npx ts-node prisma/seed.ts — 初始化数据 (仅 RUN_SEED=true)
5. node dist/main.js     — 启动后端
```

---

## 本地部署

```bash
# 1. 安装依赖
npm ci

# 2. 复制环境变量
cp .env.example apps/server/.env

# 3. 生成 Prisma Client
cd apps/server
npx prisma generate

# 4. 初始化数据库
npx prisma db push
npx ts-node prisma/seed.ts

# 5. 启动后端
cd apps/server
npm run build && npm run start:prod

# 6. 启动前端 (新终端)
cd apps/web
npm run build && npm start

# 7. 访问
# 前端: http://localhost:3000
# 后端: http://localhost:3001/api
```

---

## 数据库迁移

```bash
# 开发环境 - 自动迁移
cd apps/server
npx prisma db push

# 生产环境 - 手动迁移
npx prisma migrate deploy
```

---

## 种子数据

种子数据包含:
- 7 个角色 (OWNER, SUPER_ADMIN, OPERATION_MANAGER, DESIGN_MANAGER, OPERATION, DESIGNER, GUEST)
- 6 个默认用户 (admin/super_admin/leader/operator/designer/dm)
- 4 个店铺 + 4 个需求类型
- 7 个系统配置项

仅首次部署或需要重置测试数据时执行:
```bash
cd apps/server && npx ts-node prisma/seed.ts
```

Docker 部署需设置 `RUN_SEED=true`:
```bash
RUN_SEED=true docker compose up -d
```

---

## 健康检查

| 端点 | 说明 |
|------|------|
| `GET /api/health` | 应用健康 + 数据库连接检查 |
| Docker Healthcheck | 每 30 秒间隔，超时 10 秒，重试 3 次 |

---

## 冒烟测试

部署完成后运行 `SMOKE_TEST_CHECKLIST.md` 中的 40 项验证:

1. 应用启动
2. 登录认证
3. 法旨完整生命周期 (创建→提交→审批→制作→审核→完成)
4. Timeline 时间线
5. Audit 审计
6. 公告
7. 系统配置
8. 用户管理
9. RBAC 权限
10. 错误处理

---

## 优雅关闭

后端应用支持 `SIGTERM` 信号，收到后:
1. 停止接收新请求
2. 等待进行中的请求完成
3. 关闭数据库连接
4. 刷新日志缓冲区
5. 进程退出

Docker stop 会自动发送 SIGTERM。

---

## 备份

```bash
# 手动备份 (默认输出到 ./backups/)
bash scripts/backup.sh

# 指定输出目录
bash scripts/backup.sh /path/to/backups

# 自动保留最近 30 个备份
```

## 恢复

```bash
bash scripts/restore.sh backups/tianji_db_20260701_120000.db
```

---

## 升级流程

1. 备份数据库: `bash scripts/backup.sh`
2. `git pull` 获取新代码
3. `npm ci` 更新依赖
4. `cd apps/server && npx prisma generate`
5. `npx prisma migrate deploy` 执行迁移
6. `npm run build` 重新构建
7. 重启服务

## 回滚流程

1. `docker compose down` 停止服务
2. `git revert <commit>` 或 `git checkout <old-tag>`
3. 恢复数据库: `bash scripts/restore.sh <backup-file>`
4. `docker compose up -d` 重启

---

## 部署验证

部署后执行:
```bash
# 1. 健康检查
curl http://localhost:3001/api/health
# 期望: {"status":"ok","database":"connected"}

# 2. 检查环境变量
curl http://localhost:3001/api/system-config | jq

# 3. 登录测试
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# 期望: {"success":true,"data":{"accessToken":"...","user":{"role":"OWNER"}}}
```
