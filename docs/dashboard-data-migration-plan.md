# 天机阁 Dashboard 数据迁移规划

## 1. 文档边界

本文只定义驾驶舱后续所需的数据模型与迁移策略，不在本轮修改 Prisma Schema、生成 Migration、写入业务数据或调整 seed。实施前必须再次备份数据库与上传目录，并在独立测试库完成迁移演练。

## 2. ImageTask 分配与审核审计字段

建议为 `ImageTask` 增加以下可空字段：

| 字段 | 类型建议 | 关系 / 索引 | 用途 |
| --- | --- | --- | --- |
| `assignedAt` | `DateTime?` | `@@index([assignedAt])` | 首次或最近一次有效分配时间 |
| `assignedById` | `Int?` | 关联 `User`，`@@index([assignedById])` | 执行分配或改派的人 |
| `reviewedAt` | `DateTime?` | `@@index([reviewedAt])` | 最近一次设计审核时间 |
| `reviewedById` | `Int?` | 关联 `User`，`@@index([reviewedById])` | 执行设计审核的人 |

关系删除策略建议使用 `onDelete: SetNull`，避免停用或删除用户后破坏任务审计链。改派时更新 `assignedAt/assignedById`，同时保留 AuditEvent；不能仅依靠当前 `designerId` 推断历史分配。

## 3. 周计划模型选择

不建议直接在 `ImageTask` 增加单一 `planWeek` 字段。单字段无法表达周中追加、跨周延续、改派、取消和冻结历史，且会覆盖原计划。

建议使用规范化模型：

### WeeklyPlan

- `id`
- `weekStart`：上海时区周一对应的 UTC 边界
- `weekEnd`：右开区间边界
- `teamId` 或计划所属组织标识（当前无团队实体时先可空）
- `status`：`DRAFT / ACTIVE / FROZEN / CLOSED`
- `createdById / createdAt / updatedById / updatedAt`
- 唯一约束：同一组织、同一 `weekStart` 只能有一个有效计划

### WeeklyPlanItem

- `id`
- `weeklyPlanId`
- `imageTaskId`
- `designerId`
- `plannedAt`
- `source`：`WEEK_START / MIDWEEK_ADD / CARRY_OVER / REASSIGN`
- `cancelledAt / cancelledById / cancelReason`
- `completedAt`
- 审计字段
- 索引：`weeklyPlanId`、`imageTaskId`、`designerId`、`completedAt`

### 业务规则

1. 周边界统一使用 `Asia/Shanghai`，查询采用左闭右开区间。
2. 周初生成计划时记录当时负责人，不随后续改派覆盖历史。
3. 周中新增任务创建新的 `MIDWEEK_ADD` 项，不回写为周初计划。
4. 改派时关闭原计划项并创建 `REASSIGN` 项，保留双方历史。
5. 取消任务只标记取消，不物理删除计划项。
6. 计划冻结后禁止普通角色修改；管理员修正必须产生审计事件。
7. 团队统计按计划归属，个人统计按计划项的 `designerId`。
8. 完成数以计划项 `completedAt` 落入统计窗口为准。
9. 跨周未完成任务在新周创建 `CARRY_OVER` 项，旧周数据保持不变。

## 4. TaskSubmissionRecord

为可靠统计提交、撤回和重新提交，建议新增不可变记录表：

- `id`
- `taskId`
- `submitterId`
- `submittedAt`
- `submissionType`：`INITIAL / RESUBMIT`
- `submissionSequence`
- `withdrawnAt / withdrawnById`
- `processedAt / processedById`
- `result`：`PENDING / APPROVED / REJECTED / WITHDRAWN`
- `approvalRecordId?`
- `requestId?`
- `createdAt`

每次提交审批新增一条记录；撤回只补充撤回字段，不删除记录。Dashboard 的“今日提交”“首次提交”“重复提交”应基于此表，而不是从 Task 当前状态倒推。

## 5. 历史数据与统计启用策略

1. 不伪造历史：无法由现有字段或 AuditEvent 确认的时间、操作者保持 `null`。
2. 设定明确的 `statisticsActivationAt`。启用日前的分配时长、审核时长和周计划完成率标记为“数据不足”，不参与 SLA。
3. 只对可验证的 AuditEvent 做保守回填：要求目标实体、动作、操作者和时间均可确定。
4. 同一事件存在冲突时不自动猜测，记录到迁移异常清单人工确认。
5. `Task.approvedAt` 当前为字符串兼容字段，未来迁移时先解析可验证值至临时列，再切换为 `DateTime?`；本轮不处理。
6. AuditEvent 的展示去重仅用于界面，不删除原始审计数据，也不作为迁移去重依据。
7. 历史审批提交只在 ApprovalRecord 与 AuditEvent 能形成唯一证据链时回填；证据不足时不创建虚假提交记录。

## 6. 迁移影响

- **Prisma Schema**：新增可空审计字段、关系、索引和三张业务记录表。
- **API**：分配、改派、提交、撤回、审批和设计审核动作需要写入新记录；读取接口保持兼容。
- **状态流转**：不改变现有状态机，只在合法动作完成后追加审计数据。
- **现有业务数据**：不覆盖当前负责人和状态；历史值只做可验证回填。
- **周计划统计**：切换为 WeeklyPlanItem 口径，并区分计划量、实际完成量与跨周遗留。
- **运营主管驾驶舱**：提交批次、处理时长和审批量改由 TaskSubmissionRecord 计算。
- **设计师工作台**：个人计划和完成量按计划项负责人统计，不根据当前负责人倒推历史。
- **设计主管驾驶舱**：分配、改派和审核时长使用 ImageTask 审计字段。
- **测试与部署**：增加迁移演练、影子统计、回滚测试及跨时区边界测试；部署需先备份再扩展表结构。

## 7. 迁移与回滚方案

1. 在测试库增加新表和可空字段，先不改变现有读路径。
2. 执行只读分析脚本，输出可回填、不可回填和冲突三类报告。
3. 执行可验证回填，并核对 Task、ImageTask、User、AuditEvent 数量及外键。
4. 双写阶段由业务动作同时写现有状态和新审计字段，Dashboard 仍读取旧口径。
5. 影子统计阶段并行计算新旧结果，记录差异但不影响用户页面。
6. 验收通过后切换 Dashboard 读取新模型，并保留一个发布周期的回退开关。
7. 回滚时先切回旧读路径，再回滚应用版本；新增可空字段和表暂不删除，防止数据丢失。

## 8. 分阶段实施建议

### 阶段 A：审计字段

增加 ImageTask 分配 / 审核字段和关系，补齐业务动作写入及单元测试。

### 阶段 B：提交记录

新增 TaskSubmissionRecord，覆盖提交、撤回、退回后重提，并建立统计口径。

### 阶段 C：周计划

新增 WeeklyPlan / WeeklyPlanItem，先提供后台计算和核对，不立即替换驾驶舱。

### 阶段 D：历史回填与影子统计

按统计启用日执行保守回填，连续核对至少一个完整自然周。

### 阶段 E：驾驶舱切换

切换至新口径，发布迁移报告、差异报告和回滚手册后再冻结模型。

## 9. 本轮结论

- 不修改 Prisma Schema。
- 不生成 Migration。
- 不修改 seed。
- 不写入或清洗现有业务数据。
- 当前 P0 修复继续使用真实 Task / ImageTask 数量和现有 AuditEvent，只修正权限、口径与展示。
