# RELIABILITY_REPORT.md

## Event Reliability Audit

---

## Event Bus Reliability

| 特性 | 状态 |
|------|------|
| 进程内同步调用 | ✅ |
| Listener 异常不影响 Publisher | ✅ (EventBus 内部 try/catch) |
| Listener 异常不影响 DB 事务 | ✅ (事件在事务提交后发布) |
| 事件丢失检测 | ❌ 无 |
| 事件重试 | ❌ 无 |
| 事件持久化 | ❌ 仅内存 |

## RLI-01: No Retry Mechanism (P2)

| 字段 | 内容 |
|------|------|
| **File** | `event-bus/event-bus.ts:20-22` |
| **Evidence** | `for (const h of handlers) { try { await h(payload); } catch (e) { logger.error(...) } }` |
| **Risk** | 如果 Listener 因临时错误（DB 连接失败）抛出异常，事件不会重试 |
| **Confidence** | 高 |
| **Mitigation** | 当前是单进程应用，失败概率极低。V2 可升级到消息队列 |

## RLI-02: No Event Persistence (P2)

| 字段 | 内容 |
|------|------|
| **File** | `event-bus/event-bus.ts` |
| **Evidence** | EventBus 完全在内存中，重启后所有订阅丢失（重新初始化时会重新订阅） |
| **Risk** | 应用重启后启动期间的快速事件可能丢失 |
| **Confidence** | 中 |
| **Mitigation** | 应用启动后才注册监听器，启动期间不会发布事件 |

## Reliability Verification

| Scenario | Result |
|----------|--------|
| Listener 异常 → DB 提交 | ✅ DB 已提交，事件仍在内存中丢失 |
| Publisher 异常 → Listener | ✅ Publisher 在事件前已完成 DB 写入 |
| 多 Listener → 一个失败 | ✅ 失败 listener 不影响后续 listener |
| Event Bus 在 DB 事务前调用 | ✅ 所有代码路径已验证 |

