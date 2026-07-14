# CHANGELOG.md

## 天机阁 V1.0.0 RC

### Sprint 0 — 架构搭建
- 初始化 monorepo (npm workspaces)
- NestJS 后端 + Next.js 前端
- Prisma ORM + SQLite
- JWT 认证 + RBAC 权限

### Sprint 1-3 — 核心业务
- 法旨 CRUD
- 审批流程
- 图片任务管理
- 店铺/需求类型管理

### Sprint 4-5 — 工作流
- 工作流引擎 + 状态机
- Domain Events 事件系统
- Event Bus 进程内事件总线
- 审批中心 + 审核中心

### Sprint 6 — 企业体验
- 角色工作台
- 通知中心
- 全局搜索
- 深色模式

### Sprint 7 — TDL 设计语言
- Design Token 统一
- 统一组件封装
- 品牌视觉
- ErrorBoundary

### RFC-008 — Timeline & Audit
- 工作流历史 WorkflowHistory
- 审计中心 AuditEvent
- 时间线 Timeline API

### RFC-009 — Release Hardening
- 事务修复 (approve/reject/remove \)
- 备份脚本
- 部署文档

### RFC-010 — Architecture Cleanup
- OperationLog → Audit 迁移
- RBAC 角色统一
- SystemConfig 版本追踪

### RFC-011 — RC Final
- 架构冻结
- 文档同步
- Technical Debt 记录
- Code Review 准备

### Audit Fixes (002-007)
- JWT 硬编码密钥修复
- CORS 配置修复
- Dashboard 性能优化 (18 count → 1 SQL)
- Timeline 去重
- API @HttpCode(201) 标准化
- 66 个单元测试
- 反馈模块
