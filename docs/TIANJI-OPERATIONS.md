# 天机阁生产运维手册

适用范围：公司内部局域网正式主机。本文只记录已验证的正式脚本和恢复步骤，不包含 JWT、密码、`.env` 内容或其他密钥。

## 正式运行边界

- 正式访问地址：`http://192.168.13.126:3000`
- 前端端口：TCP 3000；后端端口：TCP 3001。
- 数据根目录：`D:\TianjiData`
- 正式本地备份：`D:\TianjiData\backups\batches`
- Z 盘是可选的第二副本同步目标，绝不是在线数据库或启动依赖。
- 不要手工结束 `node.exe`，不要删除运行状态文件，也不要直接移动或替换 `tianji.db`。

所有命令均在仓库根目录执行：

```powershell
Set-Location 'C:\Users\zhouhaojie\Documents\天帝宗--天机阁'
```

## 日常操作

### 启动

```powershell
.\scripts\start-tianji.ps1 -NoBrowser
```

启动器会检查构建产物、端口归属、运行状态和本地备份条件，并启动后端、前端和 Watchdog。它不会接管或结束不属于 Tianji 的进程。

### 停止

```powershell
.\scripts\stop-tianji.ps1 -NoPause
```

停止脚本只会停止状态文件中记录、且 PID、启动时间、可执行路径和命令行均匹配的 Tianji 进程。

### 重启

```powershell
.\scripts\stop-tianji.ps1 -NoPause
.\scripts\start-tianji.ps1 -NoBrowser
```

不要用任务管理器或 `taskkill` 替代正式停止脚本。

### 手工冷备份

```powershell
.\scripts\backup-tianji.ps1 -StopServices -RestartAfter -NoPause
```

该命令正式停止 Tianji、创建并校验本地冷备份、随后重启 Tianji。成功批次目录包含数据库、附件、隔离附件清单、配置副本、清单和校验信息。

### 同步一个已验证批次到 Z 盘

```powershell
.\scripts\sync-tianji-backup.ps1 `
  -BackupBatchPath 'D:\TianjiData\backups\batches\<batchId>' `
  -NoPause
```

提升管理员 PowerShell 可能看不到普通用户会话映射的 Z 盘。此时同步会告警或跳过，但本地 D 盘已验证备份仍是成功结果；恢复网络盘后可补做同步。不要通过修改 UAC、注册表或网络策略强行暴露映射盘。

## 状态和健康检查

### 查看记录的运行状态

```powershell
Get-Content 'D:\TianjiData\logs\runtime-state.json' -Raw | ConvertFrom-Json
```

### 检查端口与进程

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 |
  Select-Object LocalAddress, LocalPort, OwningProcess
Get-Process -Id <frontendPid>, <backendPid>, <watchdogPid>
```

### 四个正式健康检查

```powershell
Invoke-WebRequest http://127.0.0.1:3000/login -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3001/api/health -UseBasicParsing
Invoke-WebRequest http://192.168.13.126:3000/login -UseBasicParsing
Invoke-WebRequest http://192.168.13.126:3001/api/health -UseBasicParsing
```

四个请求都应返回 HTTP 200。

## 日志位置

- 生命周期和运行状态：`D:\TianjiData\logs\launcher-events.jsonl`、`D:\TianjiData\logs\runtime-state.json`
- 冷备份记录：`D:\TianjiData\logs\backup.log`
- 数据库 ACL 操作记录：`D:\TianjiData\logs\r3-2b2c1-database-acl.log`
- 服务输出和错误：`%TEMP%\tianji-runtime\frontend.out.log`、`frontend.err.log`、`backend.out.log`、`backend.err.log`、`watchdog.log`

先读取日志再决定操作。不要把删除日志、重装 Node、删库或清空数据作为常规故障处理手段。

## 恢复流程

恢复会替换正式数据库和活动附件，只能在确认故障、选定完整验证批次后执行。恢复前先确认使用的批次具有 `manifest.json`，且不是 `.tmp` 或带有 `failure.json` 的失败批次。

1. 记录故障现象、当前时间和待恢复批次。
2. 确认最新可用批次，优先选择 `D:\TianjiData\backups\batches\<batchId>`。
3. 执行恢复命令。恢复脚本会验证批次、停止 Tianji、额外创建恢复前保护备份、暂存当前数据库与附件、复制恢复内容、校验哈希与文件数，并在失败时回退本次替换。

```powershell
.\scripts\restore-tianji.ps1 `
  -BackupBatchPath 'D:\TianjiData\backups\batches\<batchId>' `
  -ConfirmPhrase RESTORE-TIANJI `
  -NoPause
```

4. 脚本完成后执行四个健康检查。
5. 使用真实账号登录，打开 dashboard、法旨和图片任务，确认已有数据可读。
6. 记录所用批次和恢复结果。不要立即删除 `D:\TianjiData\temp\restore-previous` 中的恢复前保护数据。

真实恢复演练必须单独授权，不要在日常运维或排障时试运行恢复命令。

## 安全配置回滚

### 防火墙

正式 Tianji 入站规则仅允许 `E:\node.exe` 的 TCP 3000/3001，范围为 `192.168.12.0/23`。两条历史 Node.js JavaScript Runtime 宽泛规则应保持 **Disabled**，不要删除，作为 R3 最终签收前的快速回滚选项。

防火墙策略灾难回滚文件位于：

```text
D:\TianjiData\backups\firewall\pre-r3-2b2b-20260903-110328.wfw
```

该文件会恢复完整 Windows 防火墙策略。仅在局部规则恢复失败、经管理员确认后，在提升 PowerShell 中执行：

```powershell
netsh advfirewall import 'D:\TianjiData\backups\firewall\pre-r3-2b2b-20260903-110328.wfw'
```

导入后立即检查 Windows 防火墙仍启用、Tianji 四个健康端点正常，并由另一台局域网设备验证访问。

### 数据库 ACL

数据库 ACL 快照位于：

```text
D:\TianjiData\backups\acl\r3-2b2c1\
```

只在数据库 ACL 收紧导致启动或 SQLite 权限错误时使用对应本次快照。管理员 PowerShell 中从 `D:\TianjiData` 执行：

```powershell
Set-Location 'D:\TianjiData'
icacls . /restore 'D:\TianjiData\backups\acl\r3-2b2c1\<snapshot>.acl'
```

恢复后通过正式启动器启动 Tianji，再检查 SQLite、端口和四个健康端点。不得通过重新授予 `Authenticated Users: Modify` 作为常规解决方案。

## 常见故障处理顺序

### 页面无法打开

1. 查看 `runtime-state.json` 与服务错误日志。
2. 检查 3000、3001 是否监听。
3. 执行四个健康检查。
4. 确认 Tianji 专用防火墙规则仍启用，再检查 LAN 网络。

### 后端无法启动

1. 查看 `%TEMP%\tianji-runtime\backend.err.log`。
2. 检查端口 3001 是否被非 Tianji 进程占用。
3. 检查 `.env` 是否仍受保护且 `NODE_ENV=production`。
4. 检查 `D:\TianjiData\database` ACL 和 SQLite 健康。
5. 使用正式启动脚本；不要手动启动不明 `node.exe`。

### 数据库异常

1. 先检查 `tianji.db` 是否存在、SQLite 日志是否出现 `SQLITE_READONLY`、`SQLITE_CANTOPEN` 或损坏提示。
2. 检查 database ACL 是否仍只保留必要主体。
3. 确认最新本地验证备份。
4. 需要恢复时走本手册的恢复流程，不要手工覆盖数据库文件。

### 局域网设备无法访问

1. 在主机执行本地和 LAN 四个健康检查。
2. 确认主机 LAN 地址仍为 `192.168.13.126`。
3. 确认 Tianji 专用防火墙规则仍启用，且远端在 `192.168.12.0/23`。
4. 再检查公司网络和目标设备，不要扩大防火墙到任意地址。

### 生命周期状态异常

1. 查看 `runtime-state.json`、`launcher-events.jsonl` 与 Watchdog 日志。
2. 使用 `stop-tianji.ps1`；它会拒绝停止不属于 Tianji 的 PID。
3. 再使用 `start-tianji.ps1 -NoBrowser`。
4. 若端口被非 Tianji 进程占用，保留该进程，先确认归属后再处理。

## 禁止操作

- 不要手工删除、替换或编辑 `D:\TianjiData\database\tianji.db`。
- 不要在运行中的 `.next` 上执行生产 build。
- 不要删除 Disabled 的历史 Node.js 防火墙规则。
- 不要把 Z 盘作为唯一备份或在线数据库目录。
- 不要输出、复制或提交 `.env`、JWT、密码、令牌。
- 不要用“重装、删库、清空数据”作为常规排障手段。
