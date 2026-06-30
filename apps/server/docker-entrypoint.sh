#!/bin/sh
set -e

echo "🏗️  天机阁 启动序列..."
echo ""

# Prisma 生成客户端
echo "📦 生成 Prisma Client..."
npx prisma generate

# 数据库迁移（自动）
echo "🗄️  运行数据库迁移..."
npx prisma migrate deploy

# 种子数据
echo "🌱 初始化种子数据..."
npx ts-node prisma/seed.ts

echo ""
echo "🚀 启动天机阁后端服务..."
echo ""

exec node dist/main.js
