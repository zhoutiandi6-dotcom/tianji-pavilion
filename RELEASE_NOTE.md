# RELEASE_NOTE.md

## 天机阁 V1.0.0 RC — 发布说明

### 概述

天机阁是一款企业内部设计协作管理平台。
V1 版本聚焦法旨（设计需求）的创建、审批、执行、审核全流程管理。

### 核心功能

- **法旨中心**: 创建、编辑、提交、审批设计需求
- **图片任务**: 分派设计师、状态追踪、审核
- **工作流引擎**: 完整的状态机 + 生命周期管理
- **时间线**: 法旨全生命周期事件追踪
- **审计中心**: 所有操作自动记录，不可篡改
- **RBAC 权限**: 6 种角色，精细化权限控制
- **公告系统**: 管理员发布系统公告

### 技术架构

- 前端: Next.js 14 + TypeScript + Ant Design 5
- 后端: NestJS + TypeScript + Prisma 5
- 数据库: SQLite (V1)
- 部署: Docker / 本地 Node.js

### 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 系统所有者 | admin | admin123 |
| 超级管理员 | super_admin | admin123 |
| 运营主管 | leader | leader123 |
| 运营 | operator | operator123 |
| 设计师 | designer | designer123 |
| 设计主管 | dm | dm123 |

### 部署方式

详见 DEPLOYMENT_GUIDE.md
