# 天机阁 — TianJi Pavilion

企业内部设计协作管理平台。

## 架构

```
apps/
  server/    — NestJS 后端 (Port 3001)
  web/       — Next.js 前端 (Port 3000)
packages/
  types/     — 共享 TypeScript 类型
  config/    — 共享配置
  ui/        — 共享 UI 组件
prisma/      — 数据库 Schema + Migrations
docs/        — 架构文档 + 部署指南
scripts/     — 备份恢复脚本
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js 14 + TypeScript + Ant Design 5 |
| 后端 | NestJS + TypeScript |
| 数据库 | SQLite (V1) |
| ORM | Prisma 5 |
| 认证 | JWT + bcrypt |
| 权限 | RBAC + Ownership |
| 事件 | 内置 Event Bus (in-process) |
| 部署 | Docker + docker-compose |

## 快速开始

### Docker (推荐)

```bash
cp .env.example apps/server/.env
# 编辑 .env 设置 JWT_SECRET
docker compose up -d
# 访问 http://localhost:3000
```

### 本地开发

```bash
npm ci
cp .env.example apps/server/.env
cd apps/server && npx prisma generate && npx prisma db push && npx ts-node prisma/seed.ts
cd apps/server && npm run start:dev   # 后端 :3001
cd apps/web && npm run dev            # 前端 :3000
```

### 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 系统所有者 | admin | admin123 |
| 超级管理员 | super_admin | admin123 |
| 运营主管 | leader | leader123 |
| 运营 | operator | operator123 |
| 设计师 | designer | designer123 |
| 设计主管 | dm | dm123 |

## 核心模块

- **Workflow Engine** — 工作流引擎，唯一生命周期管理器
- **State Machine** — 状态机，验证所有状态转换
- **Event Bus** — 内置事件总线 (in-process)
- **Timeline** — 统一事件时间线 API
- **Audit Center** — 审计中心，事件驱动
- **RBAC** — 角色权限控制 (6 种角色)
- **Announcement** — 系统公告 (Owner 发布)

## 文档

- [架构决策记录](docs/adr/ADR-008-Workflow-Timeline.md)
- [部署指南](docs/deployment/README.md)
- [代码审查信息](CODE_REVIEW_INFO.md)
- [技术债务](TECHNICAL_DEBT.md)
