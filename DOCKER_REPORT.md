# DOCKER_REPORT.md

## Docker Configuration Audit

---

## Overview

| Component | Status | Detail |
|-----------|--------|--------|
| docker-compose.yml | ✅ Present | v3.8, 2 services (server + web) |
| Server Dockerfile | ✅ Present | Multi-stage, node:22-alpine |
| Web Dockerfile | ✅ Present | Multi-stage, node:22-alpine |
| docker-entrypoint.sh | ✅ Present | Prisma generate + migrate + seed |

## P1 Findings

### DCK-01: docker-entrypoint.sh Contains Hardcoded Seed

| 字段 | 内容 |
|------|------|
| **File** | pps/server/docker-entrypoint.sh:16-18 |
| **Evidence** | 
px ts-node prisma/seed.ts 在每个容器启动时自动执行 |
| **Risk** | 生产环境下每次启动重复执行 seed 可能导致 upsert 逻辑正常，但新增种子数据会覆盖现有配置 |
| **Confidence** | 高 |
| **Suggested Fix** | 通过环境变量控制 seed 执行，如 RUN_SEED=true |

### DCK-02: Web Dockerfile Uses Standalone Mode — Not Validated

| 字段 | 内容 |
|------|------|
| **File** | pps/web/Dockerfile |
| **Evidence** | 构建 .next/standalone，但 
ext.config.js 中未设置 output: "standalone" |
| **Risk** | 无 output: "standalone" 配置时，.next/standalone 目录可能不存在或不完整 |
| **Confidence** | 高 |
| **Suggested Fix** | 在 
ext.config.js 中添加 output: "standalone" |

### DCK-03: Backend Image Copies Prisma CLI — Unnecessary

| 字段 | 内容 |
|------|------|
| **File** | pps/server/Dockerfile:35-37 |
| **Evidence** | 复制 
ode_modules/prisma 到运行时镜像，但运行时不再需要 prisma CLI (仅 @prisma/client 必需) |
| **Image Size** | 无必要地增加约 30MB |
| **Confidence** | 中 |
| **Suggested Fix** | 仅复制 @prisma/client，移除 prisma 和 schema-engine |

## P2 Findings

### DCK-04: No .dockerignore

| 字段 | 内容 |
|------|------|
| **Evidence** | .dockerignore 文件不存在 |
| **Risk** | 构建上下文可能包含 
ode_modules、.git 等多余文件，增大构建上下文 |
| **Confidence** | 低 — Node.js 22 构建不影响 |
