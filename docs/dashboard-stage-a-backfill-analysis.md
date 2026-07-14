# 天机阁驾驶舱阶段 A 历史回填分析

生成时间：2026-07-14T06:53:06.594Z

> 本报告由只读分析脚本生成。本轮未执行任何历史回填，也未修改 AuditEvent。

## 判定原则

只有实体 ID、操作者、动作和时间都明确，且不存在冲突事件时，才归入可可靠回填。其余数据保持 null。

## 汇总

- 可以可靠回填：29
- 存在冲突：4
- 无法回填：11

## 1. 可以可靠回填

- **ImageTask#42 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T07:03:10.560Z, assignedById=5`
- **ImageTask#45 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T00:37:35.870Z, assignedById=5`
- **ImageTask#46 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T00:37:35.885Z, assignedById=5`
- **ImageTask#48 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T00:52:12.039Z, assignedById=5`
- **ImageTask#50 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T00:52:54.503Z, assignedById=5`
- **ImageTask#52 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T00:53:38.400Z, assignedById=5`
- **ImageTask#54 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T01:04:51.943Z, assignedById=5`
- **ImageTask#54 approval**：Latest review event is an approval with a known operator and timestamp. 建议值：`approvedAt=2026-07-07T01:04:52.292Z, approvedById=6`
- **ImageTask#55 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T01:27:59.550Z, assignedById=5`
- **ImageTask#55 approval**：Latest review event is an approval with a known operator and timestamp. 建议值：`approvedAt=2026-07-07T01:27:59.916Z, approvedById=6`
- **ImageTask#57 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T01:30:19.772Z, assignedById=5`
- **ImageTask#57 approval**：Latest review event is an approval with a known operator and timestamp. 建议值：`approvedAt=2026-07-07T01:30:20.148Z, approvedById=6`
- **ImageTask#75 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-07T07:55:06.942Z, assignedById=5`
- **ImageTask#90 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-09T08:03:00.373Z, assignedById=27`
- **ImageTask#103 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-14T06:16:43.868Z, assignedById=5`
- **ImageTask#104 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-14T06:16:43.876Z, assignedById=5`
- **ImageTask#105 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-14T06:16:43.884Z, assignedById=5`
- **ImageTask#106 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-08T06:41:58.954Z, assignedById=27`
- **ImageTask#107 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-08T01:38:50.021Z, assignedById=5`
- **ImageTask#108 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-08T01:38:50.046Z, assignedById=5`
- **ImageTask#254 assignment**：Latest complete assignment event matches the current designer. 建议值：`assignedAt=2026-07-14T06:16:38.884Z, assignedById=38`
- **Task#26 submission**：A single ordered submission and approval chain is present. 建议值：`sequence=1, type=INITIAL, result=APPROVED, approvalRecordId=18`
- **Task#27 submission**：A single ordered submission and approval chain is present. 建议值：`sequence=1, type=INITIAL, result=APPROVED, approvalRecordId=24`
- **Task#28 submission**：A single ordered submission and approval chain is present. 建议值：`sequence=1, type=INITIAL, result=APPROVED, approvalRecordId=23`
- **Task#29 submission**：A single ordered submission and approval chain is present. 建议值：`sequence=1, type=INITIAL, result=APPROVED, approvalRecordId=26`
- **Task#30 submission**：A single ordered submission and approval chain is present. 建议值：`sequence=1, type=INITIAL, result=APPROVED, approvalRecordId=25`
- **Task#32 submission**：A single ordered submission and approval chain is present. 建议值：`sequence=1, type=INITIAL, result=APPROVED, approvalRecordId=22`
- **Task#39 submission**：A single ordered submission and approval chain is present. 建议值：`sequence=1, type=INITIAL, result=APPROVED, approvalRecordId=27`
- **Task#48 submission**：A single ordered submission and approval chain is present. 建议值：`sequence=1, type=INITIAL, result=APPROVED, approvalRecordId=36`

## 2. 存在冲突

- **Task#19 submission**：Multiple approval records exist, but historical submission boundaries are unavailable.
- **Task#20 submission**：Multiple approval records exist, but historical submission boundaries are unavailable.
- **Task#89 submission**：Multiple approval records exist, but historical submission boundaries are unavailable.
- **Task#90 submission**：Multiple approval records exist, but historical submission boundaries are unavailable.

## 3. 无法回填

- **Task#11 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#13 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#14 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#15 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#16 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#17 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#18 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#21 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#34 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#37 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.
- **Task#38 submission**：Submitter, submission time and approval evidence do not form a complete ordered chain.

## 执行结论

- 本轮只生成分析报告，不执行 UPDATE、INSERT 或 DELETE。
- 可回填项仍需在数据库副本中生成明确变更清单并经产品确认后才能执行。
- 冲突和无法回填项继续保持 null，不使用当前状态反推历史。
