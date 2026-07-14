#!/bin/bash
# ===== 天机阁 数据库恢复脚本 =====
# Usage: bash scripts/restore.sh <backup_file>

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/restore.sh <backup_file>"
  echo "Example: bash scripts/restore.sh backups/tianji_db_20260701_120000.db"
  exit 1
fi

BACKUP_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$PROJECT_DIR/apps/server/prisma/dev.db"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Stop the server (if running via pm2/docker)
echo "   Stop the server before restoring!"
echo "   Press Enter to continue or Ctrl+C to abort..."
read -r

cp "$BACKUP_FILE" "$DB_PATH"
echo "✅ Database restored from: $BACKUP_FILE"
echo "   Restart the server now."
