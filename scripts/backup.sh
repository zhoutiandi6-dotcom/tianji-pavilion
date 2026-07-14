#!/bin/bash
# ===== 天机阁 数据库备份脚本 =====
# Usage: bash scripts/backup.sh [output_dir]
# Default output: ./backups/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${1:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_PATH="$PROJECT_DIR/apps/server/prisma/dev.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database file not found at $DB_PATH"
  exit 1
fi

BACKUP_FILE="$BACKUP_DIR/tianji_db_$TIMESTAMP.db"
cp "$DB_PATH" "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/tianji_db_*.db 2>/dev/null | tail -n +31 | xargs -I {} rm -f {} 2>/dev/null || true
echo "   Cleaned up old backups (kept last 30)"
