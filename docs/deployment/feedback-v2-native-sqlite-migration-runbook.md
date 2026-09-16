# 天机阁｜反馈模块 V2 正式 SQLite 迁移运行手册

## 唯一执行路径

本次发布**只使用 Python 标准库 `sqlite3` 执行原生 SQL**：

`apps/server/prisma/migrations/20260916_feedback_v2/migration.sql`

禁止在本次发布窗口运行 `prisma migrate deploy`，也禁止在同一正式库上混用两种路径。该 SQL 已在正式库 SQLite backup 副本上通过，且 `foreign_key_check = 0`。

## 发布前条件

1. 取得批准的旧版本发布包、V2 发布包、数据库与附件目录磁盘空间。
2. 提前通知用户停机；迁移期间严禁附件上传、反馈提交、法旨创建或任何写数据库操作。
3. 记录发布编号、操作者、开始时间及当前服务进程 ID。
4. 将以下脚本保存为 `C:\TianjiRelease\run_feedback_v2_migration.py`，并从 V2 发布包根目录执行。不要使用 PowerShell `Out-File` 直接改写 migration 文件。

```python
import shutil, sqlite3, sys
from pathlib import Path

db = Path(sys.argv[1]).resolve()
sql_file = Path(sys.argv[2]).resolve()
before_json = Path(sys.argv[3]).resolve()
after_json = Path(sys.argv[4]).resolve()
tables = ["pilot_feedback", "attachments", "users", "tasks", "image_tasks", "audit_events"]

def query_counts(conn):
    return {name: conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in tables}

def check(conn, phase):
    integrity = conn.execute("PRAGMA integrity_check").fetchall()
    fks = conn.execute("PRAGMA foreign_key_check").fetchall()
    if integrity != [("ok",)] or fks:
        raise RuntimeError(f"{phase} check failed: integrity={integrity}, foreign_keys={fks}")

conn = sqlite3.connect(db)
check(conn, "before")
before = query_counts(conn)
before_json.write_text(__import__("json").dumps(before, indent=2), encoding="utf-8")
try:
    conn.executescript(sql_file.read_text(encoding="utf-8"))
    conn.commit()
    check(conn, "after")
    after = query_counts(conn)
    if after != before:
        raise RuntimeError(f"Unexpected row-count change: before={before}, after={after}")
    required_feedback = {"title", "handlingNote"}
    feedback_columns = {r[1] for r in conn.execute('PRAGMA table_info("pilot_feedback")')}
    attachment_columns = {r[1] for r in conn.execute('PRAGMA table_info("attachments")')}
    history_exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='feedback_status_history'").fetchone()
    if not required_feedback <= feedback_columns or "feedbackId" not in attachment_columns or not history_exists:
        raise RuntimeError("V2 schema verification failed")
    after_json.write_text(__import__("json").dumps(after, indent=2), encoding="utf-8")
finally:
    conn.close()
```

## 正式操作步骤

1. 停止前端与后端服务。确认其监听端口不再响应，并通过任务管理器或服务管理器确认没有 `node dist/main`、`node ...server.js` 进程。
2. 等待现有上传和数据库请求完成；检查后端日志不再有写请求，并在停机后再次确认数据库文件的修改时间 60 秒内保持不变。
3. 创建带时间戳的完整备份，绝不覆盖既有备份：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = "Z:\设计资料\10 周豪杰\天机阁\backups\feedback-v2-$stamp"
New-Item -ItemType Directory -Path "$backupRoot\database", "$backupRoot\uploads" -Force
Copy-Item -LiteralPath 'D:\TianjiData\database\tianji.db' -Destination "$backupRoot\database\tianji.db" -ErrorAction Stop
Copy-Item -LiteralPath 'D:\TianjiData\uploads\attachments' -Destination "$backupRoot\uploads\attachments" -Recurse -ErrorAction Stop
Get-FileHash 'D:\TianjiData\database\tianji.db' -Algorithm SHA256 | Set-Content "$backupRoot\database\tianji.db.sha256"
```

4. 比较备份数据库 SHA-256；确认附件副本文件数与源目录一致。
5. 执行唯一迁移命令：

```powershell
python C:\TianjiRelease\run_feedback_v2_migration.py `
  D:\TianjiData\database\tianji.db `
  C:\TianjiRelease\apps\server\prisma\migrations\20260916_feedback_v2\migration.sql `
  C:\TianjiRelease\feedback-v2-before-counts.json `
  C:\TianjiRelease\feedback-v2-after-counts.json
```

6. 命令成功后核对 `before/after` 行数文件完全相同；脚本已经执行 `integrity_check`、`foreign_key_check`、字段、表和外键验证。
7. 使用 V2 发布包运行 `prisma generate`（只生成客户端，不执行迁移），再启动后端，最后启动前端。
8. 生产冒烟：管理员登录、普通运营打开反馈中心、旧反馈详情、旧附件下载；不在冒烟阶段创建测试数据或开放运营主管“不采纳”。

## 失败回滚

只要 migration、数据库检查、后端启动或冒烟任一步失败，立即：

1. 停止新前后端服务，禁止继续在失败的新库上修补。
2. 将 `D:\TianjiData\database\tianji.db` 替换为本窗口开始前的备份数据库文件。
3. 若本窗口发生任何附件写入，将 `uploads\attachments` 恢复为附件备份；正常停机迁移不应产生附件变化。
4. 启动旧版本服务。
5. 验证旧系统可登录、查看法旨并下载附件。
6. 保留失败数据库副本、日志、`before/after` 行数文件供后续分析；不得再次在正式库尝试不同迁移路径。

## 预计停机

以已验证的约 1 MB SQLite 库和 165 个附件为基准：迁移 SQL 通常少于 1 分钟；包含停服务、备份、哈希/行数检查、启动和冒烟，发布窗口预留 **20–30 分钟**。附件目录更大时以实际复制速度为准。
