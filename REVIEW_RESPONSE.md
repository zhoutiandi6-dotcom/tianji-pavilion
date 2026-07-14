# REVIEW_RESPONSE.md

## Version
v1.0.0-audit-003-fix

---

## Review Item: AUTH-01

| 字段 | 内容 |
|------|------|
| **ID** | AUTH-01 |
| **Title** | JWT uses fallback secret |
| **Status** | **Fixed** ✅ |
| **Files Modified** | src/auth/jwt.strategy.ts, src/auth/auth.module.ts, src/main.ts |
| **Reason** | 两个文件中的 || 'fallback-secret' 在生产环境未配置 JWT_SECRET 时会产生可预测的密钥。攻击者可用已知密钥伪造任意 JWT Token 冒充任意用户 |
| **Solution** | ① 移除所有 fallback 默认值，改为 process.env.JWT_SECRET! (TypeScript 非空断言) ② main.ts 启动时校验 if (!process.env.JWT_SECRET) { process.exit(1) } ③ 同时校验默认值 "change-me-to-a-random-secret" 也未修改时拒绝启动 |
| **Verification** | 全局 grep fallback -r src/ 确认无残留。手动检查 main.ts 启动校验逻辑确认 process.exit(1) 路径触发。启动时无 JWT_SECRET 立即终止进程，不清清列出 |

---

## Review Item: AUTH-02

| 字段 | 内容 |
|------|------|
| **ID** | AUTH-02 |
| **Title** | Production CORS configuration requires verification |
| **Status** | **Fixed** ✅ |
| **Files Modified** | src/main.ts, .env.example |
| **Reason** | enableCors({ origin: true }) 允许任意域名的跨域请求。配合 credentials: true 存在 CSRF 风险 |
| **Solution** | 根据 NODE_ENV 分离开发/生产 CORS。开发模式仅允许 localhost:3000/3001。生产模式从 ALLOWED_ORIGINS 环境变量读取白名单。白名单为空时拒绝所有跨域 |
| **Verification** | 手动检查 main.ts CORS 分支逻辑。NODE_ENV=development → 仅 localhost。NODE_ENV=production + ALLOWED_ORIGINS=https://company.com → 仅该来源。NODE_ENV=production + 未设置 ALLOWED_ORIGINS → 拒绝所有来源 |

---

## Remaining Issues (Not Part of This Fix)

| ID | Priority | Issue | Reason Not Fixed |
|----|----------|-------|------------------|
| IDOR-01~03 | P1 | 3 个 IDOR 风险 | 非 P0，安排在 Security Fix 后续 Sprint |
| AUTH-03 | P1 | RolesGuard 未使用 | 非 P0，现有 AuthGuard + inline role checks 已够用 |
| DTO-01~02 | P1 | Announcement/SysConfig 用 any | 非 P0，功能正常 |
| PRIV-01 | P1 | 审批记录无角色限制 | 非 P0 |
| AUTH-04 | P2 | 31 处硬编码角色字符串 | 非 P0 |
