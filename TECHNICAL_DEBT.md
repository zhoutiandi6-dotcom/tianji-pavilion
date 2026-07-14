# 天机阁 V1 — 技术债务清单

## 已知问题

### P1 (需尽快修复)

| 问题 | 模块 | 影响 |
|------|------|------|
| Notification 自动触发未完全实现 | workflow-notification | 部分流程事件不会自动生成通知 |
| 附件上传 UI 未对接 | attachments | 后端 API 存在，前端上传按钮未连接 |
| 错误页面 (403/404/500) 缺失 | web | Next.js 14 静态导出冲突，错误页已移除 |
| ESLint 需要 `--no-lint` 编译 | web | ESLint v10 与 Next.js 14 配置不兼容 |
| Frontend `next start` 模式不稳定 | web | 缺少 `.next` 缓存时静默崩溃，需用 `dev` 模式 |

### P2 (可延期)

| 问题 | 模块 | 说明 |
|------|------|------|
| SQLite 不适用于生产规模 | database | 当前基于文件锁，并发写入受限 |
| 无用户激活通知 | users | 管理员创建用户后，无法自动通知用户 |
| ImageTask 拖拽排序未实现 | image-tasks | 前端缺少 react-dnd 支持 |
| 审批中心/审核中心独立页面缺失 | web | 运营主管和设计主管共用法旨列表页 |
| 登录页加载慢 (~15s) | web | Ant Design 首次加载包体积大 |
| 未配置 PM2 进程管理 | deployment | 生产部署需额外配置进程守护 |
| 无 CORS 白名单安全配置 | server | 当前允许所有来源 (origin: true) |

## 已延期到 V2 的功能

- AI 图像生成 (ABIP)
- AI 审稿 (AI Review)
- Agent 自动化流程
- Prompt 引擎
- 多数据库支持 (PostgreSQL)
- WebSocket 实时通知
- 国际化 (i18n)
- 多租户

## 架构合理但需注意

- OperationLogService 仍存在，但已重定向到 audit_events 表
- StatusCalculatorService 仍存在但未被使用 (WorkflowEngine.StateMachine 替代)
- `any` 类型在前端广泛使用，缺乏严格类型定义
- 部分控制器包含过多业务逻辑，未完全迁移到 Service 层
