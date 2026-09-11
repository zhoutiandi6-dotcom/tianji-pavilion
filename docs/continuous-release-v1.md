# 天机阁持续发布 V1

## 固定环境

| 环境 | 前端 | 后端 | 数据与附件 |
| --- | --- | --- | --- |
| 正式 | 3000 | 3001 | `D:\TianjiData` |
| 测试 | 3300 | 3301 | `D:\TianjiTestData` |

测试环境只能从已验证的冷备份初始化：

```powershell
.\scripts\test-environment.ps1 -Action Initialize
```

它只复制 `D:\TianjiData\backups\batches` 中的备份，不读取或写入正式数据库与正式附件目录。测试账户仅在测试库中维护；不要在脚本或 release 中保存正式账号、密码或 JWT secret。

## Release

稳定分支必须明确；开发分支使用 `feature/<name>`，修复分支使用 `fix/<name>`。工作树干净、测试通过后才可创建 release：

```powershell
.\scripts\new-release.ps1 -Release 20260911-001
```

Release 保存在 `D:\TianjiData\releases\<release-id>`，包含前后端产物、Prisma schema 与 migration、副本构建日志、完整 manifest、Git commit 和关键 SHA256。release 创建后不得修改。

## 验收与发布

```powershell
.\scripts\test-environment.ps1 -Action Start -Release 20260911-001
.\scripts\release-check.ps1 -Release 20260911-001
.\scripts\deploy.ps1 -Release 20260911-001
```

`release-check.ps1` 只在同一个 release 已在固定测试环境的 3300/3301 健康运行时输出 `RELEASE_READY`。没有 `RELEASE_READY` 不得运行 deploy。

`deploy.ps1` 创建 `D:\TianjiData\deployments\<timestamp>-<release-id>` 的独立证据目录，先创建并验证冷备份，再停止 Watchdog、前后端，确认端口释放，物理复制并目录切换运行产物，最后依次启动后端、前端和 Watchdog。它从不在服务运行时覆盖 `.next` 或 `dist`。

Migration 默认阻断发布。只有经人工评审后，才可使用 `-ApproveMigrations` 让生产 Prisma 流程执行 release 所携带且尚未 applied 的 migration。数据库回滚不自动执行。

代码回滚：

```powershell
.\scripts\rollback.ps1 -Deployment <deployment-id>
```

Rollback 只恢复该 deployment 的发布前 `dist` 与 `.next`，再按后端、前端、Watchdog 的顺序启动。不会回滚数据库。

## 风险等级

| 级别 | 变更 | 最低流程 |
| --- | --- | --- |
| LOW | 文案、UI、CSS、非数据交互 | 测试环境、简单验收、release、deploy |
| MEDIUM | API、附件、图片标注、字段、筛选、权限页面 | 分支、自动测试、测试环境、人工验收、release、deploy、Smoke Test |
| HIGH | 状态机、角色模型、权限体系、删除、迁移、核心结构、大模块 | 方案评审、分支、独立测试库、migration rehearsal、完整回归、测试环境、人工验收、release、正式发布 |

临时 `release-rehearsal`、`run-release-rehearsal.ps1`、`sim-watchdog.ps1` 和 Temp 演练目录不属于该体系，也不得进入 release。
