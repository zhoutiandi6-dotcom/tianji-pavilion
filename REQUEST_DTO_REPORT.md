# REQUEST_DTO_REPORT.md

## Request DTO Audit

---

## DTO Coverage

| DTO | Validators | Uses class-validator | Status |
|-----|-----------|---------------------|--------|
| CreateTaskDto | 12 | ✅ | ✅ |
| UpdateTaskDto | 12 | ✅ | ✅ |
| CreateImageTaskDto | 7 | ✅ | ✅ |
| UpdateImageTaskDto | 12 | ✅ | ✅ |
| CreateUserDto | 13 | ✅ | ✅ |
| UpdateUserDto | 8 | ✅ | ✅ |
| CreateStoreDto | 6 | ✅ | ✅ |
| UpdateStoreDto | 9 | ✅ | ✅ |
| CreateRequirementTypeDto | 5 | ✅ | ✅ |
| UpdateRequirementTypeDto | 7 | ✅ | ✅ |
| QueryTaskDto | 18 | ✅ | ✅ (unused) |

## P1 Findings

### DTO-01: Announcement Controller Uses ny Type

| 字段 | 内容 |
|------|------|
| **File** | nnouncement.controller.ts |
| **Evidence** | @Body() dto: any (create + update) |
| **Missing** | CreateAnnouncementDto 和 UpdateAnnouncementDto |

### DTO-02: SystemConfig Controller Uses ny Type

| 字段 | 内容 |
|------|------|
| **File** | system-config.controller.ts |
| **Evidence** | @Body() body: any |
| **Missing** | UpdateSystemConfigDto |

### DTO-03: No DTO for Auth Endpoints

| 字段 | 内容 |
|------|------|
| **File** | uth.controller.ts |
| **Evidence** | LoginDto, ChangePasswordDto, InitOwnerDto are embedded in controller, not in dto/ folder |
| **Issue** | 虽然验证逻辑正确，但 DTO 位置不统一 |

## P2 Findings

### DTO-04: QueryTaskDto Unused

| 字段 | 内容 |
|------|------|
| **File** | 	asks/dto/query-task.dto.ts |
| **Evidence** | 18 个验证规则的 DTO，但 TasksController.findAll() 未使用 |
| **Impact** | 查询参数无类型验证 |

### DTO-05: Missing Query DTOs for Pagination

| 字段 | 内容 |
|------|------|
| **Files** | nnouncement.controller.ts, udit.controller.ts, 
otifications.controller.ts |
| **Evidence** | 分页参数 page 和 pageSize 直接作为方法参数，无 DTO 封装 |
| **Impact** | 参数未经过 class-validator 验证 |

### DTO-06: Auth DTOs in Controller File

| 字段 | 内容 |
|------|------|
| **Files** | uth.controller.ts (LoginDto, ChangePasswordDto, InitOwnerDto) |
| **Issue** | DTO 定义在 controller 文件中而非 dto/ 目录，与其他模块不统一 |
