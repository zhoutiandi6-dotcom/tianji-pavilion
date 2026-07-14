# TianJi Pavilion Trial Run Record

This file records each small-scope real business trial run. Fill one row per task or per complete workflow.

## Current Trial Batch

| Field | Value |
| --- | --- |
| Test date |  |
| Trial owner |  |
| Participating roles | ADMIN / OPERATOR / OPS_MANAGER / DESIGN_MANAGER / DESIGNER |
| Environment | Local / LAN / Other |
| Build version or date |  |
| Notes |  |

## Run Records

| No. | Test date | Participating role | Test account | Task ID / serial number | Flow passed | Blocker | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TR-001 |  | OPERATOR | operator |  | Not started |  | Create draft, submit ops approval |
| TR-002 |  | OPS_MANAGER | leader |  | Not started |  | Approve or reject ops submission |
| TR-003 |  | DESIGN_MANAGER | dm |  | Not started |  | Assign designer, review submitted image task |
| TR-004 |  | DESIGNER | designer |  | Not started |  | Start design, upload completion, submit review |
| TR-005 |  | ADMIN | admin |  | Not started |  | Check global visibility and operation logs |

## Recommended Trial Flow

1. OPERATOR creates a task draft and generated image tasks.
2. OPERATOR fills required main task and image task information.
3. OPERATOR uploads or fills material/reference links.
4. OPERATOR submits for ops approval.
5. OPS_MANAGER approves or rejects with a remark.
6. DESIGN_MANAGER assigns image tasks to DESIGNER.
7. DESIGNER starts work, uploads completion attachment or updates design note.
8. DESIGNER submits for design review.
9. DESIGN_MANAGER rejects once with review note, then approves after resubmission.
10. OPERATOR checks final review result, attachments, and notes.
11. ADMIN checks visibility, operation logs, and abnormal permission boundaries.

## Pass Criteria

- Login works for all trial accounts.
- Each role only sees tasks and image tasks allowed by backend permissions.
- Main task status and image task status move according to the approved workflow.
- Attachments can be uploaded and downloaded by authorized users.
- Reject, resubmit, approve, assign, and upload actions create operation logs.
- Empty states are understandable when there is no todo, no attachment, no image task, or no log.

