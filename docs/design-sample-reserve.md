# Design Sample Reserve Notes

This document records the V1 data thinking for a future design sample repository. It is not an AI feature, model training feature, scoring system, or workflow change.

## Current Traceability

Completed design uploads are already traceable through existing entities:

| Context | Current source |
| --- | --- |
| Fazhi serial number | `Task.serialNumber` |
| Image task | `ImageTask.id`, `imageIndex`, `imageTitle` |
| Product and store | `Task.productCode`, `productName`, `storeId`, `store` |
| Requirement type | `ImageTask.requirementType` and `Task.requirementType` |
| Original requirement | `ImageTask.requirement`, `originalImageUrl`, `referenceImageUrl` |
| Reference / original / completed files | `Attachment` with `IMAGE_ORIGINAL`, `IMAGE_REFERENCE`, `IMAGE_COMPLETED` |
| Designer | `ImageTask.designerId`, `designer` relation |
| Upload time and uploader | `Attachment.uploadedAt`, `uploadedById` |
| Review result | `ImageTask.status`, `reviewStatus`, `reviewRemark` |

## Missing For Structured Samples

The current schema does not have a clean field for structured image annotation JSON on `Task`, `ImageTask`, or `Attachment`.

Do not store annotation JSON in:

- `ImageTask.remark`
- `Attachment.previewPath`
- `Attachment.thumbnailPath`
- operation log `metadata`

Those fields have different meanings or are not stable domain storage.

## Recommended Future Minimal Change

If structured annotations need persistence, use one of these small options:

1. Add `annotationJson String?` to `ImageTask`.
2. Add a small `ImageAnnotation` table linked to `imageTaskId`.

Prefer option 1 for V1 if annotations are saved as a single JSON document and do not need querying by annotation item.

## Current Phase Boundary

The current phase only provides:

- Image task workbench layout.
- `ImageAnnotationViewer` component skeleton.
- Local page-level annotation draft behavior.
- Clear UI copy that persistent annotation storage is not enabled yet.

The current phase does not provide:

- AI review.
- Model training.
- Complex sample scoring.
- Online image editing.
- Multi-user real-time collaboration.
