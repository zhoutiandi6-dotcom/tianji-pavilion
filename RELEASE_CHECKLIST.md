# RELEASE_CHECKLIST.md

## Version
V1.0.0 RC Final

## Purpose
正式发布前的验证清单。所有项目通过后准予发布。

---

## 1. 环境准备

- [ ] JWT_SECRET 设置为强随机密钥（非默认值）
- [ ] NODE_ENV=production 已设置
- [ ] ALLOWED_ORIGINS 已配置（生产环境必需）
- [ ] DATABASE_URL 路径正确
- [ ] 数据库文件所在目录存在且可写
- [ ] .env 文件不包含敏感信息的提交到 Git

## 2. 应用启动

- [ ] 后端启动: cd apps/server && npm run start:prod
- [ ] 前端构建: cd apps/web && npm run build
- [ ] 前端启动: cd apps/web && npm start
- [ ] Docker 启动: docker compose up -d
- [ ] 启动日志无异常报错

## 3. 健康检查

- [ ] GET /api/health → 200 { status: "ok", database: "connected" }
- [ ] Docker healthcheck 通过
- [ ] Docker logs 无 ERROR

## 4. 认证

- [ ] POST /api/auth/login 有效凭证 → 201 + accessToken
- [ ] POST /api/auth/login 无效凭证 → 401
- [ ] GET /api/auth/me 有效 token → 200 + user info
- [ ] GET /api/auth/me 无 token → 401
- [ ] GET /api/auth/init-status → { initialized: true }

## 5. 法旨工作流

- [ ] 运营创建法旨 (DRAFT)
- [ ] 运营提交审批 (PENDING_APPROVAL)
- [ ] 运营主管审批通过 (APPROVED)
- [ ] 运营添加图片任务
- [ ] 设计师开始制作 (IN_PROGRESS)
- [ ] 设计师提交审核 (PENDING_DESIGN_REVIEW)
- [ ] 设计主管审核通过 (COMPLETED)
- [ ] 法旨状态自动计算为 COMPLETED
- [ ] 运营撤回审批
- [ ] 运营主管驳回审批

## 6. Timeline

- [ ] GET /api/timeline/task/1 → 事件列表
- [ ] 包含: 创建、提交、审批、图片任务等事件
- [ ] 无重复事件

## 7. 审计

- [ ] GET /api/audit → 审计事件列表
- [ ] 包含操作人和操作时间

## 8. 公告

- [ ] Owner 创建公告 → 201
- [ ] Owner 发布公告 → 200
- [ ] 运营创建公告 → 403

## 9. 系统设置

- [ ] GET /api/system-config → 配置列表
- [ ] PUT /api/system-config → 配置更新成功
- [ ] GET /api/system-config/:key/history → 版本信息

## 10. 用户管理

- [ ] Owner 创建用户（默认未激活）
- [ ] Owner 启用用户
- [ ] Owner 禁用用户
- [ ] Owner 重置密码
- [ ] 非管理员访问用户管理 → 403

## 11. RBAC 权限

- [ ] 设计师查看非法旨详情 → 403/正确过滤
- [ ] 运营法旨编辑权限（仅自己创建）
- [ ] 运营主管审批权限
- [ ] 设计主管审核权限

## 12. 数据持久化

- [ ] 数据库迁移: 
px prisma migrate deploy 通过
- [ ] 种子数据完整（用户、角色、店铺、需求类型）
- [ ] 备份: ash scripts/backup.sh 成功
- [ ] 恢复: ash scripts/restore.sh <backup> 成功

## 13. 优雅关闭

- [ ] 发送 SIGTERM 后进程正常退出
- [ ] Docker stop 正常 (10s 内)
- [ ] 重启后数据完整

## 14. 冒烟测试

- [ ] SMOKE_TEST_CHECKLIST.md 全部通过

---

## 签署

| 角色 | 通过 | 签名 | 日期 |
|------|------|------|------|
| 开发者 | □ | | |
| 测试 | □ | | |
| 项目负责人 | □ | | |

**发布决定**: [ ] 批准 [ ] 有条件批准 [ ] 否决
