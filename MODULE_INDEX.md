# MODULE_INDEX.md

## 核心模块索引

---

### Workflow Engine

| | |
|---|---|
| 路径 | pps/server/src/workflow-engine/ |
| 职责 | 工作流生命周期管理器，所有状态转换必须经过此引擎 |
| 提供 | WorkflowEngine, WorkflowActions, StateMachine |
| 依赖 | Event Bus, Domain Events, OperationLog, Prisma |
| 子模块 | engine/, state-machine/, ctions/, ctivities/ |

### State Machine

| | |
|---|---|
| 路径 | pps/server/src/workflow-engine/state-machine/ |
| 职责 | 验证所有状态转换，确保非法转换被拒绝 |
| 提供 | canTransition(), calcTaskWorkflowStatus(), getAllowedTransitions(), isValidStatus() |
| 状态 | DRAFT → PENDING_APPROVAL → APPROVED → IN_PROGRESS → PENDING_DESIGN_REVIEW → COMPLETED → ARCHIVED |
| 图片状态 | NOT_STARTED → IN_PROGRESS → PENDING_DESIGN_REVIEW → COMPLETED |

### Event Bus

| | |
|---|---|
| 路径 | pps/server/src/event-bus/ |
| 职责 | 进程内事件总线，支持 publish/subscribe 模式 |
| 提供 | EventBus (subscribe, publish) |
| 特点 | 全局单例，所有 Domain Events 通过此总线分发 |

### Domain Events

| | |
|---|---|
| 路径 | pps/server/src/domain-events/ |
| 职责 | 领域事件定义，共 13 个事件类 |
| 核心事件 | WorkflowCreated, WorkflowSubmitted, WorkflowWithdrawn, WorkflowApproved, WorkflowRejected, WorkflowCompleted, WorkflowArchived, ImageTaskStarted, ImageTaskSubmittedForReview, ImageTaskReviewApproved, ImageTaskReviewRejected, ImageTaskAssigned, TaskUpdated |

### Timeline

| | |
|---|---|
| 路径 | pps/server/src/timeline/ |
| 职责 | 统一事件时间线 API，聚合 WorkflowHistory + 审批记录 + 图片任务 |
| API | GET /api/timeline/task/:taskId |
| 特点 | 只读聚合，不包含业务逻辑 |

### Audit Center

| | |
|---|---|
| 路径 | pps/server/src/audit/ |
| 职责 | 事件驱动的审计中心，不可变的审计记录 |
| 提供 | AuditEventService, AuditController |
| API | GET /api/audit, GET /api/audit/:resourceType/:resourceId |
| 特点 | 通过 Event Bus 自动记录所有 Domain Events |

### Workflow History

| | |
|---|---|
| 路径 | pps/server/src/workflow-history/ |
| 职责 | 不可变的历史记录，所有 Workflow 转换自动写入 |
| 提供 | WorkflowHistoryService |
| 特点 | 事件驱动，监听 12 个事件，自动生成 workflow_history 记录 |

### RBAC

| | |
|---|---|
| 路径 | pps/server/src/auth/ + pps/server/src/common/roles.guard.ts |
| 职责 | JWT 认证 + 角色权限控制 |
| 角色 | OWNER, SUPER_ADMIN, OPERATION_MANAGER, DESIGN_MANAGER, OPERATION, DESIGNER, GUEST |
| 提供 | JwtStrategy, RolesGuard, AuthService |

### Announcement

| | |
|---|---|
| 路径 | pps/server/src/announcement/ |
| 职责 | 系统公告管理，Owner/管理员发布 |
| API | GET/POST/PATCH/DELETE /api/announcements, POST publish, POST toggle-pin |
| 权限 | OWNER, SUPER_ADMIN 可创建/编辑；OWNER 可删除/发布/置顶 |

### System Config

| | |
|---|---|
| 路径 | pps/server/src/system-config/ |
| 职责 | 系统配置的 Key-Value 持久化，支持版本追踪 |
| 提供 | SystemConfigService, SystemConfigController |
| API | GET/PUT /api/system-config, GET /api/system-config/:key/history |
| 特点 | 每次修改自动递增 version，记录修改人和原因 |

### Approval

| | |
|---|---|
| 路径 | pps/server/src/approval/ |
| 职责 | 审批流程（代理 Workflow Engine） |
| API | POST submit/withdraw/approve/reject, GET records |
| 角色 | 运营→提交，运营主管→审批 |

### Tasks (法旨)

| | |
|---|---|
| 路径 | pps/server/src/tasks/ |
| 职责 | 法旨 CRUD + 数据可见范围控制 |
| API | GET/POST/PATCH/DELETE /api/tasks |
| 可见性 | 设计师只能看到分配给自己的法旨 |

### Image Tasks

| | |
|---|---|
| 路径 | pps/server/src/image-tasks/ |
| 职责 | 图片任务 CRUD + 状态管理 |
| API | 9 个端点（CRUD + start/submit-review/approve-review/reject-review） |
| 状态 | 设计师改状态，设计主管审核，发布 Domain Events |

### Notifications

| | |
|---|---|
| 路径 | pps/server/src/notifications/ |
| 职责 | 用户通知 CRUD |
| API | GET /api/notifications, GET unread-count, PATCH /:id/read, POST /read-all |

### Workflow Notification (event-driven)

| | |
|---|---|
| 路径 | pps/server/src/workflow-notification/ |
| 职责 | 事件驱动的通知生成器，监听 7 种 Workflow 事件 |
| 特点 | 不直接调用 Notification Service，通过 Event Bus 解耦 |

### Users

| | |
|---|---|
| 路径 | pps/server/src/users/ |
| 职责 | 用户管理（启用/禁用/重置密码/修改角色） |
| API | 8 个端点 |
| 保护 | Owner 不能被禁用/降级/删除 |

### Auth

| | |
|---|---|
| 路径 | pps/server/src/auth/ |
| 职责 | JWT 登录、密码修改、系统初始化 |
| API | POST login, GET me, POST change-password, GET init-status, POST init |
| 安全 | 5 次登录失败 → 15 分钟锁定 |

### Operation Log (deprecated)

| | |
|---|---|
| 路径 | pps/server/src/operation-log/ |
| 状态 | ⚠️ **已废弃** — 所有数据写入 udit_events 表 |
| 迁移 | GET /api/audit 替代 GET /api/operation-logs |

### Dashboard

| | |
|---|---|
| 路径 | pps/server/src/dashboard/ |
| 职责 | 仪表盘数据聚合 |
| API | GET /api/dashboard/overview |
| 特点 | 实时数据库统计，根据角色返回不同数据 |

### Health

| | |
|---|---|
| 路径 | pps/server/src/health/ |
| 职责 | 健康检查 |
| API | GET /api/health |
| 返回 | { status, database, timestamp } |

---

## 前端页面路由

| 路由 | 功能 |
|------|------|
| /login | 登录 |
| /setup | 系统初始化(仅首次) |
| /change-password | 修改密码 |
| /dashboard | 角色工作台 |
| /dashboard/fazhi | 法旨列表 |
| /dashboard/fazhi/new | 新建法旨 |
| /dashboard/fazhi/[id] | 法旨详情 |
| /dashboard/stores | 店铺管理 |
| /dashboard/requirement-types | 需求类型管理 |
| /dashboard/users | 用户管理 |
| /dashboard/notifications | 通知中心 |
| /dashboard/logs | 操作日志 |
| /dashboard/settings | 系统设置 |

## 前端组件

| 组件 | 路径 |
|------|------|
| WorkflowTimeline | components/timeline/WorkflowTimeline.tsx |
| Loading | components/Loading.tsx |
| EmptyState | components/EmptyState.tsx |
| ErrorBoundary | components/ErrorBoundary.tsx |
| GlobalSearch | components/GlobalSearch.tsx |
| BreadcrumbNav | components/BreadcrumbNav.tsx |

---

## 数据库模型 (17 tables)

| 表 | 说明 | 是否可变 |
|----|------|----------|
| users | 用户 | ✅ |
| oles | 角色 | ✅ |
| permissions | 权限 | ✅ |
| ole_permissions | 角色权限关联 | ✅ |
| stores | 店铺 | ✅ |
| equirement_types | 需求类型 | ✅ |
| 	asks | 法旨 | ✅ |
| image_tasks | 图片任务 | ✅ |
| ttachments | 附件 | ✅ |
| pproval_records | 审批记录 | ✅ |
| 
otifications | 通知 | ✅ |
| system_configs | 系统配置 | ✅ (有版本追踪) |
| nnouncements | 系统公告 | ✅ |
| workflow_history | 工作流历史 | ❌ **不可变** |
| udit_events | 审计事件 | ❌ **不可变** |
| operation_logs | 操作日志 | ⚠️ **已废弃** |
| _prisma_migrations | 迁移记录 | ✅ |
