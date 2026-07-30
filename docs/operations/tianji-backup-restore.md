# Tianji Backup And Restore

Tianji runs only from `TIANJI_DATA_ROOT`. Z drive stores verified backup batches and is never used as a live SQLite location.

## Batch layout

`D:\TianjiData\backups\batches\<yyyyMMdd-HHmmss>` contains:

- `database\tianji.db`
- `uploads\attachments\`
- `quarantine\orphan-attachments\` (archived separately and not restored into active uploads)
- `manifest.json`, `manifest.sha256`, and `verification.json`

The manifest records database and attachment hashes, table counts, file counts, sizes, application commit, and cloud-sync state. It contains no credentials, tokens, cookies, or business file contents.

## Commands

Create a manual cold backup. This stops Tianji before copying and restarts it afterwards:

```powershell
.\scripts\backup-tianji.ps1 -StopServices -RestartAfter
```

Sync one verified batch to the configured Z-drive backup root:

```powershell
.\scripts\sync-tianji-backup.ps1 -BackupBatchPath "D:\TianjiData\backups\batches\<batchId>"
```

Restore only from an explicit batch. The script stages the selected batch on D drive, verifies it, stops Tianji, creates a `before-restore` protection batch, then restores database and active uploads. It does not restore quarantine into active uploads.

```powershell
.\scripts\restore-tianji.ps1 `
  -BackupBatchPath "Z:\设计资料\10 周豪杰\天机阁\backups\batches\<batchId>" `
  -ConfirmPhrase RESTORE-TIANJI
```

## Retention

- Local D drive: keep recent 14 days, at most 30 batches, always at least 3 verified batches.
- Z drive: keep recent 90 days, always at least 12 verified batches.
- A `.protected` marker or `manifest.json` `protected: true` prevents rotation.
- Local unsynced batches are not removed by local rotation.

If Z drive is unavailable, synchronization warns and keeps the local verified batch. It never blocks the normal Tianji service start.
