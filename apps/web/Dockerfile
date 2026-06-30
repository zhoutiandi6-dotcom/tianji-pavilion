# ===== Build Stage =====
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json apps/web/next.config.js ./apps/web/
COPY packages/types/package.json packages/types/tsconfig.json ./packages/types/
COPY packages/ui/package.json packages/ui/tsconfig.json ./packages/ui/
COPY packages/config/package.json packages/config/tsconfig.json ./packages/config/

RUN npm ci --workspaces --include-workspace-root

COPY apps/web/src ./apps/web/src
COPY packages/types/src ./packages/types/src
COPY packages/ui/src ./packages/ui/src

ENV NEXT_PUBLIC_API_URL=http://localhost:3001/api
RUN cd apps/web && npm run build

# ===== Runtime Stage =====
FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache tini

COPY --from=builder /app/apps/web/.next/standalone ./standalone
COPY --from=builder /app/apps/web/.next/static ./standalone/apps/web/.next/static
COPY --from=builder /app/apps/web/public ./standalone/apps/web/public

EXPOSE 3000

ENV NEXT_PUBLIC_API_URL=http://localhost:3001/api

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "standalone/apps/web/server.js"]
