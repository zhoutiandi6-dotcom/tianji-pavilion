# SELECT_REPORT.md

## Include / Select Usage Audit

---

## P2 Findings

### SEL-01: Dashboard Controller — Users Count with Active Filter Fine

| 字段 | 内容 |
|------|------|
| **File** | dashboard.controller.ts:30 |
| **Current** | 	his.prisma.user.count({ where: { isActive: true } }) |
| **Assessment** | ✅ 合理，count 只返回数字 |

### SEL-02: AuthService getCurrentUser — Deep Include

| 字段 | 内容 |
|------|------|
| **File** | uth.service.ts:93-99 |
| **Current** | include: { role: { include: { rolePermissions: { include: { permission: true } } } } } |
| **Assessment** | ✅ 需要返回权限列表给前端用于菜单展示，三层 include 是业务必需的 |

### SEL-03: TasksService findMany — Includes creator, store, requirementType

| 字段 | 内容 |
|------|------|
| **File** | 	asks.service.ts:44-53 |
| **Current** | 包含 creator(3 fields) + store(2 fields) + requirementType(2 fields) + imageTasks(1 field) |
| **Assessment** | ✅ 合理，全部使用 select 限制字段 |

### SEL-04: TasksService findOne — Deep Include

| 字段 | 内容 |
|------|------|
| **File** | 	asks.service.ts:62-67 |
| **Current** | imageTasks: { include: { designer, attachments } } |
| **Assessment** | ✅ 法旨详情页需要展示所有图片及其设计师和附件 |

### SEL-05: RolesPermissions — Deep Include (acceptance noted)

| 字段 | 内容 |
|------|------|
| **File** | oles-permissions.service.ts:10-13 |
| **Assessment** | ✅ 角色数固定 7，权限表 < 50 条，可接受 |

---

## Recommendation

当前项目中 include 和 select 的使用整体合理。
绝大多数查询都使用了 select 限制返回字段。
无严重过载查询。
