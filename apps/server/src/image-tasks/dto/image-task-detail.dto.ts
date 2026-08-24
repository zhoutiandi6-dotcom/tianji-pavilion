export type ImageTaskDetailPersonDto = {
  id: number;
  displayName: string;
};

export type ImageTaskDetailAttachmentDto = {
  id: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category: string;
  createdAt: Date;
};

export type ImageTaskReviewHistoryItemDto = {
  source: "AUDIT_EVENT";
  action: string;
  operator: ImageTaskDetailPersonDto | null;
  reason: string | null;
  createdAt: Date;
};

export type ImageTaskDetailDto = {
  id: number;
  imageIndex: number;
  name: string;
  imageType: string | null;
  status: string;
  requirementDescription: string | null;
  modificationRequirement: string | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  decree: {
    id: number;
    serialNumber: string;
    productCode: string | null;
    store: { id: number; name: string } | null;
    requirementType: { id: number; name: string } | null;
    priority: string;
  };
  people: {
    operator: ImageTaskDetailPersonDto;
    requesterName: string | null;
    designer: ImageTaskDetailPersonDto | null;
    assignedBy: ImageTaskDetailPersonDto | null;
  };
  sourceAttachments: ImageTaskDetailAttachmentDto[];
  completedAttachments: ImageTaskDetailAttachmentDto[];
  reviewHistory: ImageTaskReviewHistoryItemDto[];
};
