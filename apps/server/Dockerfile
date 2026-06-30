# ===== Build Stage =====
FROM node:22-alpine AS builder
WORKDIR /app

# 依赖缓存层
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/server/package.json apps/server/tsconfig.json apps/server/nest-cli.json ./apps/server/
COPY apps/server/prisma/schema.prisma ./apps/server/prisma/
COPY packages/types/package.json packages/types/tsconfig.json ./packages/types/
COPY packages/config/package.json packages/config/tsconfig.json ./packages/config/
COPY packages/ui/package.json packages/ui/tsconfig.json ./packages/ui/

RUN npm ci --workspaces --include-workspace-root

# 源码
COPY apps/server/src ./apps/server/src
COPY packages/types/src ./packages/types/src
COPY packages/config/src ./packages/config/src

RUN cd apps/server && npx prisma generate && npm run build

# ===== Runtime Stage =====
FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache tini

COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/apps/server/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/package.json ./package.json

# 上传目录
RUN mkdir -p /app/uploads

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--", "sh", "./docker-entrypoint.sh"]
