# TianJi Pavilion Trial Fix List

Use this file to track issues found during small-scope real business trials.

## Severity

| Level | Meaning |
| --- | --- |
| P0 | Blocks login, startup, data creation, or core workflow completion. Fix before continuing trial. |
| P1 | Breaks a key role workflow, permission boundary, upload/download, approval, or review action. |
| P2 | Causes confusion, repeated manual work, weak copy, missing hint, or non-blocking page issue. |
| P3 | Polish issue, wording adjustment, layout tolerance, or later optimization. |

## Status Values

- New
- Confirmed
- In progress
- Fixed
- Verified
- Deferred
- Won't fix

## Fix Items

| Issue ID | Page | Role | Description | Severity | Reproduction steps | Suggested fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TJ-FIX-001 | New Fazhi / Detail image tasks | OPERATION, DESIGNER | Personalized custom requests lack shared writing guidance, causing operator and designer interpretation gaps. | P2 | Select personalized custom requirement type and fill image task requirement. | Add non-required helper copy near requirement input; do not build a mandatory template system. | Fixed |
| TJ-FIX-002 | New Fazhi / Detail edit | OPERATION, ADMIN | Returning, refreshing, or closing with unsaved input can silently lose form content. | P1 | Fill new task or edit image task row, then click Back or close page before saving. | Add dirty-state leave confirmation and beforeunload protection; remind users to save before returning/submitting. | Fixed |
| TJ-FIX-003 | Detail image task attachments | OPERATION, DESIGNER, ADMIN | Uploaded original, reference, and completed attachments need single-file deletion without deleting the image task. | P1 | Upload an original/reference/completed attachment, then delete just that file. | Add per-attachment delete buttons with confirmation; keep backend attachment delete permission checks; soft-delete attachment only. | Fixed |
| TJ-FIX-004 | Detail image task attachments | OPERATION | Uploading an attachment after typing original/reference links or requirement may overwrite unsaved row input. | P1 | Type original link, reference link, and requirement, then upload an original or reference file without clicking Save first. | Save the current image task row before upload; reload attachments after upload so text fields remain persisted. | Fixed |
| TJ-FIX-005 | Detail workflow actions | OPERATION | Submitted but unapproved task needs a controlled way to withdraw for edits. | P1 | Operator creates a draft, submits it, then needs to modify before ops approval. | Use existing SUBMITTED -> DRAFT withdrawal transition; show Withdraw Edit only to the creator operator in SUBMITTED status. | Fixed |
| TJ-FIX-006 | Detail workflow actions | ADMIN, OPERATION, DESIGN_MANAGER | OPS_APPROVED detail page must not show operation approval buttons or trigger illegal transition toast. | P1 | Open an OPS_APPROVED task as admin/operator/design manager. | Only show submit/approve/reject in statuses where backend state machine allows them; design manager/admin can proceed with designer assignment. | Fixed |
| TJ-FIX-007 | New Fazhi / Detail image tasks | OPERATION | Image size should not be forced onto every image task, because most requests use one shared size. | P2 | Create a normal unified-size task and review form fields. | Keep main task image size/output spec field; add helper copy saying special single-image sizes can be written in that row's requirement. | Fixed |
| TJ-FIX-008 | New Fazhi / Detail image tasks | OPERATION | Online image annotation is requested by some users but would expand scope. | P3 | User wants to draw marks directly on images in the system. | Deferred: keep support for uploading annotated screenshots as reference attachments; do not build online annotation in this phase. | Deferred |

## Recording Rules

- One issue per row. Do not mix multiple defects in one item.
- Always include the role and task ID when the issue is workflow-related.
- Mark P0/P1 only when the issue blocks the trial or breaks a permission boundary.
- After fixing, verify with the same account and same reproduction path.
