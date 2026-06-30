# 天机阁 (TianJi Pavilion)

> 企业内部设计协作管理平台

---

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 客户端 | Web（浏览器） |
| 前端 | Next.js 14 (App Router) + TypeScript + Ant Design 5 |
| 后端 | NestJS + TypeScript |
| 数据库 | SQLite（V1） |
| ORM | Prisma 5 |
| 认证 | JWT + Passport + bcrypt |
| 权限 | RBAC (ADMIN/MANAGER/DESIGNER/OPERATOR) |
| 文件存储 | 本地服务器 |
| 部署 | Docker + 局域网 |

---

## 快速启动

### Windows 一键启动

双击 start.bat

### 手动启动

`ash
npm install
cd apps/server
npx prisma generate
npx prisma migrate dev --name init --skip-seed
npx ts-node prisma/seed.ts
cd ../..
npm run dev -w @tianji/server  # 终端 1
npm run dev -w @tianji/web     # 终端 2
`

### Docker 部署

`ash
docker compose up -d --build
`

## 验收账号

| 角色 | 用户名 | 密码 | 说明 |
| --- | --- | --- | --- |
| 管理员 | admin | admin123 | ⚠️ 首次登录须改密 |
| 运营 | operator | operator123 | 发布法旨、上传附件 |
| 设计师 | designer | designer123 | 查看/修改法旨状态 |

## Sprint 规划

| Sprint | 内容 | 状态 |
| --- | --- | --- |
| Sprint 0 | 架构、数据模型、JWT/RBAC、前端布局、Docker | ✅ 完成 |
| Sprint 1 | 法旨中心 CRUD | ✅ 完成 |
| Sprint 2 | 后台管理 + 通知系统 | ✅ 完成 |
| Sprint 3 | 健康检查、生产 Docker、一键启动、文档 | ✅ 完成 |
