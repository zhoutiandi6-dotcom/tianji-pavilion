#!/bin/sh
set -e

echo "🏗️  天机阁 启动序列..."
echo ""

# 等待数据库可用（SQLite 文件就绪）
DB_PATH="${DATABASE_URL#file:}"
DB_PATH="${DB_PATH:-./prisma/dev.db}"
echo "🗄️  检查数据库路径: $DB_PATH"
RETRIES=0
MAX_RETRIES=30
while [ ! -f "$DB_PATH" ] && [ $RETRIES -lt $MAX_RETRIES ]; do
  echo "   等待数据库文件创建... ($((RETRIES+1))/$MAX_RETRIES)"
  RETRIES=$((RETRIES+1))
  sleep 1
done
if [ ! -f "$DB_PATH" ]; then
  echo "⚠️  数据库文件未就绪，将在应用启动后自动创建"
fi

# Prisma 生成客户端
echo "📦 生成 Prisma Client..."
npx prisma generate

# 数据库迁移
echo "🗄️  运行数据库迁移..."
npx prisma migrate deploy

# 种子数据 — 仅在 RUN_SEED=true 时执行
if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "🌱 执行种子数据初始化..."
  npx ts-node prisma/seed.ts
else
  echo "⏭️  跳过种子数据 (RUN_SEED != true)"
fi

echo ""
echo "🚀 启动天机阁后端服务..."
echo ""

exec node dist/main.js