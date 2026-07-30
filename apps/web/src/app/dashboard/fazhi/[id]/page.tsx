'use client';

import { ClipboardEvent, useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Col, Collapse, Descriptions, Dropdown, Image, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Switch, Tag, Typography, Upload, message } from "antd";
import { ArrowLeftOutlined, CheckOutlined, DeleteOutlined, MoreOutlined, RollbackOutlined, SaveOutlined, SendOutlined, StopOutlined, UploadOutlined } from "@ant-design/icons";
import { useParams, useRouter } from "next/navigation";
import ImageAnnotationViewer, { ImageAnnotation } from "@/components/ImageAnnotationViewer";
import api, { attachmentApi, getErrorMessage, imageTaskApi, taskApi, userApi } from "@/lib/api";
import { displayName, displayRequester, displayUserName } from "@/lib/display";

const { Title, Text } = Typography;

const taskStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待运营主管审批",
  OPS_REJECTED: "运营主管退回",
  OPS_APPROVED: "已通过待设计分配",
  DESIGN_ASSIGNED: "已分配设计",
  IN_DESIGN: "设计中",
  DESIGN_REVIEW: "待设计审核",
  DESIGN_APPROVED: "已完成",
  COMPLETED: "已完成",
};

const imageStatusLabels: Record<string, string> = {
  WAITING_OPS_APPROVAL: "等待运营主管审批",
  PENDING_ASSIGNMENT: "待分配",
  NOT_STARTED: "未开始",
  IN_PROGRESS: "设计中",
  SUBMITTED_FOR_REVIEW: "已提交审核",
  REVISION_REQUIRED: "退回修改",
  APPROVED: "已完成",
  COMPLETED: "已完成",
};

const imageStatusColors: Record<string, string> = {
  WAITING_OPS_APPROVAL: "default",
  PENDING_ASSIGNMENT: "warning",
  NOT_STARTED: "blue",
  IN_PROGRESS: "processing",
  SUBMITTED_FOR_REVIEW: "gold",
  REVISION_REQUIRED: "error",
  APPROVED: "success",
  COMPLETED: "success",
};

const DESIGN_ASSIGNABLE_TASK_STATUS = ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const PASTE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
type ImageSourceType = "original" | "reference" | "completed";

const sourceLabels: Record<ImageSourceType, string> = {
  original: "原图",
  reference: "参考图",
  completed: "完成稿",
};

function groupByCategory(items: any[] = []) {
  return items.reduce((acc: Record<string, any[]>, item: any) => {
    const key = item.category || "UNKNOWN";
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function isImageAttachment(item: any) {
  const extension = String(item.extension || "").toLowerCase();
  const fileName = String(item.fileName || "").toLowerCase();
  const mimeType = String(item.mimeType || item.fileType || "").toLowerCase();
  return mimeType.startsWith("image/") || IMAGE_EXTENSIONS.some((ext) => extension === ext || fileName.endsWith(ext));
}

function isPersonalizedRequirement(value?: string) {
  return String(value || "").includes("个性化定制");
}

function imageSourceTypeFromCategory(category: string): ImageSourceType {
  if (category === "IMAGE_ORIGINAL") return "original";
  if (category === "IMAGE_COMPLETED") return "completed";
  return "reference";
}

function getImageSources(row: any, grouped: Record<string, any[]>, type: ImageSourceType) {
  if (!row) return [];
  const sources: any[] = [];
  const link = type === "original" ? row.originalImageUrl : type === "reference" ? row.referenceImageUrl : row.completedAttachmentUrl;
  const items = type === "reference"
    ? [...(grouped.IMAGE_REFERENCE || []), ...(grouped.IMAGE_ORIGINAL || [])]
    : (grouped[type === "original" ? "IMAGE_ORIGINAL" : "IMAGE_COMPLETED"] || []);
  items.filter(isImageAttachment).forEach((item: any, index: number) => {
    sources.push({ key: `attachment-${item.id}`, kind: "attachment", attachment: item, label: `${sourceLabels[type]} ${index + 1}` });
  });
  if (link) sources.push({ key: `${type}-link`, kind: "link", url: link, label: `${sourceLabels[type]}链接` });
  if (type === "reference" && row.originalImageUrl) sources.push({ key: "original-link", kind: "link", url: row.originalImageUrl, label: "原图链接" });
  return sources;
}

function attachmentCountLabel(items?: any[]) {
  const count = (items || []).length;
  return count ? `${count} 张` : "0 张";
}

function getDefaultImageSourceType(row: any): ImageSourceType {
  const grouped = groupByCategory(row?.attachments || []);
  if ((grouped.IMAGE_REFERENCE || []).some(isImageAttachment) || row?.referenceImageUrl) return "reference";
  if ((grouped.IMAGE_ORIGINAL || []).some(isImageAttachment) || row?.originalImageUrl) return "reference";
  if ((grouped.IMAGE_COMPLETED || []).some(isImageAttachment) || row?.completedAttachmentUrl) return "completed";
  return "reference";
}

export default function FazhiDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [requirementTypes, setRequirementTypes] = useState<any[]>([]);
  const [mainDraft, setMainDraft] = useState<Record<string, any>>({});
  const [editingRows, setEditingRows] = useState<Record<number, any>>({});
  const [materialLinks, setMaterialLinks] = useState("");
  const [preview, setPreview] = useState<{ open: boolean; url?: string; title?: string }>({ open: false });
  const [selectedImageTaskId, setSelectedImageTaskId] = useState<number | null>(null);
  const [checkedImageTaskIds, setCheckedImageTaskIds] = useState<number[]>([]);
  const [batchDesignerId, setBatchDesignerId] = useState<number | undefined>();
  const [imageSourceType, setImageSourceType] = useState<ImageSourceType>("reference");
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | undefined>();
  const [workbenchImage, setWorkbenchImage] = useState<{ url?: string; title?: string; blobUrl?: string }>({});
  const [annotationDrafts, setAnnotationDrafts] = useState<Record<number, ImageAnnotation[]>>({});
  const [annotationExpanded, setAnnotationExpanded] = useState(false);

  const role = currentUser?.role || "";
  const isAdmin = ["OWNER", "SUPER_ADMIN"].includes(role);
  const isOperator = role === "OPERATION";
  const isOpsManager = role === "OPERATION_MANAGER";
  const isDesignManager = role === "DESIGN_MANAGER";
  const isDesigner = role === "DESIGNER";

  const loadTask = async () => {
    setLoading(true);
    try {
      const res = await taskApi.findOne(id);
      const data = res.data.data || res.data;
      setTask(data);
      setMaterialLinks(data.materialLinks || "");
      setMainDraft({
        storeId: data.storeId,
        productCode: data.productCode || "",
        compatibleProduct: data.compatibleProduct || data.productName || "",
        requesterName: displayRequester(data, ""),
        priority: data.priority || "NORMAL",
        imageCount: data.imageCount || data.imageTasks?.length || 1,
        imageSize: data.imageSize || "",
        requirementTypeId: data.requirementTypeId || null,
      });
    } catch (err) {
      console.error("[fazhi-detail] load failed", err);
      message.error(getErrorMessage(err, "加载失败，请稍后重试"));
      router.push("/dashboard/fazhi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get("/auth/me").then((res) => setCurrentUser(res.data.data || res.data)).catch(() => router.push("/login"));
    api.get("/stores").then((res) => setStores(res.data.data || res.data || [])).catch(() => {});
      userApi.findDesigners().then((res) => setUsers(res.data.data || res.data || [])).catch(() => {});
    api.get("/requirement-types").then((res) => setRequirementTypes(res.data.data || res.data || [])).catch(() => {});
    loadTask();
  }, [id]);

  useEffect(() => () => {
    if (preview.url) window.URL.revokeObjectURL(preview.url);
  }, [preview.url]);

  const isDraftEditableStatus = task && ["DRAFT", "OPS_REJECTED"].includes(task.workflowStatus);
  const isCreator = task && task.creatorId === currentUser?.id;
  const canEditDraft = task && (isAdmin || isOperator) && isDraftEditableStatus;
  const canSubmitOps = task && (isAdmin || isOperator) && isDraftEditableStatus;
  const canWithdraw = task && isOperator && isCreator && task.workflowStatus === "SUBMITTED";
  const canOpsApprove = task && (isAdmin || isOpsManager) && task.workflowStatus === "SUBMITTED";
  const canDesignAssign = task && (isAdmin || isDesignManager) && DESIGN_ASSIGNABLE_TASK_STATUS.includes(task.workflowStatus);
  const canDeleteDraftTask = task && ["DRAFT", "OPS_REJECTED"].includes(task.workflowStatus) && (isAdmin || (isOperator && isCreator));
    const designers = users;
  const mainDraftChanged = !!task && (
    (mainDraft.storeId ?? null) !== (task.storeId ?? null) ||
    (mainDraft.productCode || "") !== (task.productCode || "") ||
    (mainDraft.compatibleProduct || "") !== (task.compatibleProduct || task.productName || "") ||
    (mainDraft.requesterName || "") !== displayRequester(task, "") ||
    (mainDraft.priority || "NORMAL") !== (task.priority || "NORMAL") ||
    Number(mainDraft.imageCount || 1) !== Number(task.imageCount || task.imageTasks?.length || 1) ||
    (mainDraft.imageSize || "") !== (task.imageSize || "") ||
    (mainDraft.requirementTypeId ?? null) !== (task.requirementTypeId ?? null)
  );
  const hasUnsavedChanges = !!task && (Object.keys(editingRows).length > 0 || materialLinks !== (task.materialLinks || "") || mainDraftChanged);
  const selectedImageTask = (task?.imageTasks || []).find((row: any) => row.id === selectedImageTaskId) || null;
  const selectedGroupedForHooks = groupByCategory(selectedImageTask?.attachments || []);
  const currentImageSources = getImageSources(selectedImageTask, selectedGroupedForHooks, imageSourceType);
  const currentImageSource = currentImageSources.find((source) => source.key === selectedSourceKey) || currentImageSources[0];
  const currentImageSourceSignature = currentImageSources.map((source) => source.key).join("|");

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!task?.imageTasks?.length) {
      setSelectedImageTaskId(null);
      return;
    }
    if (selectedImageTaskId && !task.imageTasks.some((row: any) => row.id === selectedImageTaskId)) {
      setSelectedImageTaskId(null);
    }
  }, [task?.id, task?.imageTasks?.length, selectedImageTaskId]);

  useEffect(() => {
    if (!currentImageSources.length) {
      setSelectedSourceKey(undefined);
      return;
    }
    if (!selectedSourceKey || !currentImageSources.some((source) => source.key === selectedSourceKey)) {
      setSelectedSourceKey(currentImageSources[0].key);
    }
  }, [selectedImageTask?.id, imageSourceType, currentImageSourceSignature, selectedSourceKey]);

  useEffect(() => {
    let localUrl: string | undefined;
    let disposed = false;
    if (workbenchImage.blobUrl) window.URL.revokeObjectURL(workbenchImage.blobUrl);

    const loadImage = async () => {
      if (!currentImageSource) {
        setWorkbenchImage({});
        return;
      }
      if (currentImageSource.kind === "link") {
        setWorkbenchImage({ url: currentImageSource.url, title: currentImageSource.label });
        return;
      }
      const attachment = currentImageSource.attachment;
      try {
        const res = await attachmentApi.download(attachment.id);
        localUrl = window.URL.createObjectURL(new Blob([res.data], { type: attachment.mimeType || attachment.fileType || "image/*" }));
        if (!disposed) setWorkbenchImage({ url: localUrl, blobUrl: localUrl, title: attachment.fileName || currentImageSource.label });
      } catch (err) {
        console.error("[fazhi-detail] load workbench image failed", err);
        if (!disposed) setWorkbenchImage({});
      }
    };

    loadImage();
    return () => {
      disposed = true;
      if (localUrl) window.URL.revokeObjectURL(localUrl);
    };
  }, [currentImageSource?.key, currentImageSource?.url]);

  useEffect(() => {
    if (!selectedImageTask || imageSourceType !== "completed") return;
    const completedVisible = ["DESIGN_APPROVED", "COMPLETED", "CANCELLED"].includes(task?.workflowStatus || "")
      || ["APPROVED", "COMPLETED", "SUBMITTED_FOR_REVIEW", "IN_PROGRESS", "REVISION_REQUIRED", "NOT_STARTED"].includes(selectedImageTask.status || "");
    if (!completedVisible) {
      setImageSourceType(getDefaultImageSourceType(selectedImageTask));
      setSelectedSourceKey(undefined);
    }
  }, [selectedImageTask?.id, selectedImageTask?.status, task?.workflowStatus, imageSourceType]);

  const goBack = () => {
    const leave = () => {
      if (typeof window !== "undefined" && window.history.length > 1) router.back();
      else router.push("/dashboard/fazhi");
    };
    if (!hasUnsavedChanges) {
      leave();
      return;
    }
    Modal.confirm({
      title: "当前有未保存内容",
      content: "当前有未保存内容，离开后将丢失，是否继续？填写或修改后请先点击保存，再返回或提交。",
      okText: "继续离开",
      cancelText: "留在本页",
      onOk: leave,
    });
  };

  const updateRowDraft = (rowId: number, patch: any) => {
    setEditingRows((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), ...patch } }));
  };

  const updateMainDraft = (patch: Record<string, any>) => {
    setMainDraft((prev) => ({ ...prev, ...patch }));
  };

  const openImageTaskWorkbench = (row: any) => {
    setSelectedImageTaskId(row.id);
    setImageSourceType(getDefaultImageSourceType(row));
    setSelectedSourceKey(undefined);
    setAnnotationExpanded(false);
  };

  const getRowValue = (row: any, key: string) => {
    if (Object.prototype.hasOwnProperty.call(editingRows[row.id] || {}, key)) return editingRows[row.id][key];
    return row[key];
  };

  const saveRowPatch = async (row: any, showToast = true) => {
    const patch = editingRows[row.id] || {};
    if (!Object.keys(patch).length) {
      if (showToast) message.info("没有需要保存的修改");
      return true;
    }
    try {
      await imageTaskApi.update(row.id, patch);
      if (showToast) message.success("图片任务已保存");
      setEditingRows((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return true;
    } catch (err) {
      console.error("[fazhi-detail] save image task failed", err);
      message.error(getErrorMessage(err, "保存失败，请稍后重试"));
      return false;
    }
  };

  const downloadAttachment = async (attachment: any) => {
    try {
      const res = await attachmentApi.download(attachment.id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.fileName || "attachment";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[fazhi-detail] download failed", err);
      message.error(getErrorMessage(err, "下载失败，请稍后重试"));
    }
  };

  const previewAttachment = async (attachment: any) => {
    try {
      const res = await attachmentApi.download(attachment.id);
      if (preview.url) window.URL.revokeObjectURL(preview.url);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: attachment.mimeType || attachment.fileType || "image/*" }));
      setPreview({ open: true, url, title: attachment.fileName });
    } catch (err) {
      console.error("[fazhi-detail] preview failed", err);
      message.error(getErrorMessage(err, "预览失败，请稍后重试"));
    }
  };

  const removeAttachment = async (attachment: any) => {
    try {
      await attachmentApi.remove(attachment.id);
      if (selectedSourceKey === `attachment-${attachment.id}`) setSelectedSourceKey(undefined);
      message.success("附件已删除");
      loadTask();
    } catch (err) {
      console.error("[fazhi-detail] remove attachment failed", err);
      message.error(getErrorMessage(err, "删除失败，请稍后重试"));
    }
  };

  const uploadImageAttachment = async (row: any, category: string, file: File) => {
    try {
      const saved = await saveRowPatch(row, false);
      if (!saved) return Upload.LIST_IGNORE;
      const res = await attachmentApi.uploadImageTask(row.id, category, file);
      const attachment = res.data.data || res.data;
      setSelectedImageTaskId(row.id);
      setImageSourceType(imageSourceTypeFromCategory(category));
      if (attachment?.id) setSelectedSourceKey(`attachment-${attachment.id}`);
      message.success("附件已上传");
      loadTask();
    } catch (err) {
      console.error("[fazhi-detail] upload image attachment failed", err);
      message.error(getErrorMessage(err, "上传失败，请稍后重试"));
    }
    return Upload.LIST_IGNORE;
  };

  const AttachmentThumb = ({ item, label, sourceType, allowDelete }: { item: any; label: string; sourceType: ImageSourceType; allowDelete: boolean }) => {
    const [thumbUrl, setThumbUrl] = useState<string>("");
    const image = isImageAttachment(item);

    useEffect(() => {
      let url = "";
      let disposed = false;
      if (!image) return;
      attachmentApi.download(item.id)
        .then((res) => {
          if (disposed) return;
          url = window.URL.createObjectURL(new Blob([res.data], { type: item.mimeType || item.fileType || "image/*" }));
          setThumbUrl(url);
        })
        .catch(() => setThumbUrl(""));
      return () => {
        disposed = true;
        if (url) window.URL.revokeObjectURL(url);
      };
    }, [item.id, image]);

    return (
      <div style={{ width: 118 }}>
        <div
          title={item.fileName}
          onClick={() => {
            if (image) {
              setImageSourceType(sourceType);
              setSelectedSourceKey(`attachment-${item.id}`);
              previewAttachment(item);
            } else {
              downloadAttachment(item);
            }
          }}
          style={{
            width: 118,
            height: 86,
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            overflow: "hidden",
            background: "#fafafa",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: image ? "pointer" : "default",
          }}
        >
          {thumbUrl ? (
            <img src={thumbUrl} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>{image ? "图片" : "文件"}</Text>
          )}
        </div>
        <Space size={4} style={{ marginTop: 4, width: "100%", justifyContent: "space-between" }}>
          <Text title={item.fileName} style={{ maxWidth: 76, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{label}</Text>
          {allowDelete && (
            <Popconfirm title="确认删除该附件？" onConfirm={() => removeAttachment(item)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      </div>
    );
  };

  const AttachmentGallery = ({ items, sourceType, allowDelete, emptyText }: { items: any[]; sourceType: ImageSourceType; allowDelete: boolean; emptyText: string }) => (
    items.length ? (
      <Space size={8} wrap>
        {items.map((item, index) => {
          const itemSourceType: ImageSourceType = item.category === "IMAGE_COMPLETED" ? "completed" : item.category === "IMAGE_ORIGINAL" ? "original" : sourceType;
          return <AttachmentThumb key={item.id} item={item} label={`${sourceType === "completed" ? "完成稿" : "参考图"} ${index + 1}`} sourceType={itemSourceType} allowDelete={allowDelete} />;
        })}
      </Space>
    ) : <Text type="secondary">{emptyText}</Text>
  );

  const UploadButton = ({ label, onFile }: { label: string; onFile: (file: File) => Promise<any> }) => (
    <Upload showUploadList={false} beforeUpload={(file) => onFile(file)}>
      <Button size="small" icon={<UploadOutlined />}>{label}</Button>
    </Upload>
  );

  const saveTaskLinks = async () => {
    try {
      await taskApi.update(id, { materialLinks });
      message.success("主单链接已保存");
      loadTask();
    } catch (err) {
      console.error("[fazhi-detail] save task links failed", err);
      message.error(getErrorMessage(err, "保存失败，请稍后重试"));
    }
  };

  const saveMainTask = async (showToast = true, reload = true) => {
    try {
      await taskApi.update(id, {
        storeId: mainDraft.storeId || null,
        productCode: mainDraft.productCode || "",
        compatibleProduct: mainDraft.compatibleProduct || "",
        requesterName: displayName(mainDraft.requesterName, displayRequester(task)),
        priority: mainDraft.priority || "NORMAL",
        urgent: (mainDraft.priority || "NORMAL") === "URGENT",
        imageCount: Number(mainDraft.imageCount || task.imageCount || 1),
        imageSize: mainDraft.imageSize || "",
        requirementTypeId: mainDraft.requirementTypeId || null,
        materialLinks,
      });
      if (showToast) message.success("主单信息已保存");
      if (reload) await loadTask();
      return true;
    } catch (err) {
      console.error("[fazhi-detail] save main task failed", err);
      message.error(getErrorMessage(err, "保存主单信息失败，请稍后重试"));
      return false;
    }
  };

  const saveImageTask = async (row: any) => {
    const saved = await saveRowPatch(row, true);
    if (saved) loadTask();
  };

  const isBatchAssignableImageTask = (row: any) => !!canDesignAssign && row.status === "PENDING_ASSIGNMENT" && !row.designerId;

  const toggleBatchImageTask = (row: any, checked: boolean) => {
    setCheckedImageTaskIds((prev) => checked ? Array.from(new Set([...prev, row.id])) : prev.filter((item) => item !== row.id));
  };

  const batchAssignDesigner = async () => {
    const assignableImageTasks = (task?.imageTasks || []).filter(isBatchAssignableImageTask);
    if (!checkedImageTaskIds.length) {
      message.warning("请选择待分配的图片任务");
      return;
    }
    if (checkedImageTaskIds.length !== assignableImageTasks.length || !assignableImageTasks.every((item: any) => checkedImageTaskIds.includes(item.id))) {
      message.warning("设计主管分配必须整单处理，请选择该法旨全部有效待分配图片");
      return;
    }
    if (!batchDesignerId) {
      message.warning("请选择设计师");
      return;
    }
    try {
      const res = await imageTaskApi.batchAssignTasks({ taskIds: [task.id], designerId: batchDesignerId, mode: "ASSIGN" });
      const result = res.data.data || res.data;
      message.success(`批量分配完成：成功 ${result.successCount}，失败 ${result.failedCount}`);
      setCheckedImageTaskIds([]);
      setBatchDesignerId(undefined);
      loadTask();
    } catch (err) {
      console.error("[fazhi-detail] batch assign failed", err);
      message.error(getErrorMessage(err, "批量分配失败，请稍后重试"));
    }
  };

  const submitApproval = async () => {
    try {
      // Submission validates persisted data, so save the editable main form first.
      const saved = await saveMainTask(false, false);
      if (!saved) return;
      await taskApi.submit(id);
      message.success("已提交运营主管审批");
      loadTask();
    } catch (err) {
      console.error("[fazhi-detail] submit approval failed", err);
      message.error(getErrorMessage(err, "提交失败，请稍后重试"));
    }
  };

  const withdrawApproval = async () => {
    Modal.confirm({
      title: "撤回修改",
      content: "确认撤回该法旨并回到草稿状态？撤回后可以继续编辑并重新提交审批。",
      onOk: async () => {
        try {
          await taskApi.withdraw(id);
          message.success("已撤回，可继续编辑");
          loadTask();
        } catch (err) {
          console.error("[fazhi-detail] withdraw approval failed", err);
          message.error(getErrorMessage(err, "撤回失败，请稍后重试"));
        }
      },
    });
  };

  const approveTask = async () => {
    let comment = "";
    Modal.confirm({
      title: "运营主管审批通过",
      content: <Input.TextArea rows={3} placeholder="填写审批备注，可留空" onChange={(event) => { comment = event.target.value; }} />,
      onOk: async () => {
        try {
          await taskApi.approve(id, comment);
          message.success("审批已通过");
          loadTask();
        } catch (err) {
          console.error("[fazhi-detail] approve task failed", err);
          message.error(getErrorMessage(err));
        }
      },
    });
  };

  const rejectTask = async () => {
    let comment = "";
    let issueImageTaskIds: number[] = [];
    let issueTypes: string[] = [];
    let modalContentKey: string = "content";
    Modal.confirm({
      title: "退回法旨",
      content: <Input.TextArea rows={3} placeholder="填写退回原因" onChange={(event) => { comment = event.target.value; }} />,
      ...{
        [modalContentKey]: (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Input.TextArea rows={3} placeholder="填写退回原因（必填）" onChange={(event) => { comment = event.target.value; }} />
            <div>
              <Text strong>问题图片（可多选）</Text>
              <Checkbox.Group
                style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}
                options={(task?.imageTasks || []).map((image: any) => ({ value: image.id, label: `#${image.imageIndex} ${image.imageTitle || image.imageType || "未命名图片"}` }))}
                onChange={(values) => { issueImageTaskIds = values.map(Number); }}
              />
            </div>
            <div>
              <Text strong>问题类型（可多选）</Text>
              <Checkbox.Group
                style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}
                options={["需求描述不完整", "缺少参考图", "产品信息不一致", "图片类型不明确", "附件无法使用", "其他"]}
                onChange={(values) => { issueTypes = values.map(String); }}
              />
            </div>
          </Space>
        ),
      },
      onOk: async () => {
        if (!comment.trim()) {
          message.warning("请填写退回原因");
          throw new Error("请填写退回原因");
        }
        try {
          await taskApi.reject(id, { comment: comment.trim(), issueImageTaskIds, issueTypes });
          message.success("已退回运营修改");
          loadTask();
        } catch (err) {
          console.error("[fazhi-detail] reject task failed", err);
          message.error(getErrorMessage(err));
        }
      },
    });
  };

  const startSelectedImageTask = async () => {
    if (!selectedImageTask) return;
    try {
      await imageTaskApi.update(selectedImageTask.id, { status: "IN_PROGRESS" });
      message.success("已开始制作");
      loadTask();
    } catch (err) {
      console.error("[fazhi-detail] start image task failed", err);
      message.error(getErrorMessage(err));
    }
  };

  const submitSelectedImageTask = async () => {
    if (!selectedImageTask) return;
    try {
      await imageTaskApi.submitReview(selectedImageTask.id);
      message.success("已提交设计主管审核");
      loadTask();
    } catch (err) {
      console.error("[fazhi-detail] submit design review failed", err);
      message.error(getErrorMessage(err));
    }
  };

  const reviewSelectedImageTask = (approved: boolean) => {
    if (!selectedImageTask) return;
    let remark = "";
    Modal.confirm({
      title: approved ? "审核通过" : "退回设计师修改",
      content: <Input.TextArea rows={3} placeholder={approved ? "填写审核意见，可留空" : "填写退回原因"} onChange={(event) => { remark = event.target.value; }} />,
      onOk: async () => {
        if (!approved && !remark.trim()) {
          message.warning("请填写退回原因");
          throw new Error("请填写退回原因");
        }
        try {
          if (approved) await imageTaskApi.approveReview(selectedImageTask.id, remark.trim());
          else await imageTaskApi.rejectReview(selectedImageTask.id, remark.trim());
          message.success(approved ? "完成稿审核已通过" : "已退回原设计师修改");
          loadTask();
        } catch (err) {
          console.error("[fazhi-detail] review image task failed", err);
          message.error(getErrorMessage(err));
          throw err;
        }
      },
    });
  };

  const deleteDraftTask = async () => {
    Modal.confirm({
      title: "删除草稿",
      content: "确定删除该草稿吗？删除后无法恢复。",
      okText: "确认删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          await taskApi.remove(id);
          message.success("草稿已删除");
          router.push("/dashboard/fazhi");
        } catch (err) {
          console.error("[fazhi-detail] delete task failed", err);
          message.error(getErrorMessage(err, "删除失败，请稍后重试"));
        }
      },
    });
  };

  const saveAnnotations = (rowId: number, annotations: ImageAnnotation[]) => {
    setAnnotationDrafts((prev) => ({ ...prev, [rowId]: annotations }));
    message.info("当前标注为预览能力，刷新后可能丢失。");
  };

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!task) return null;
  const selectedGrouped = groupByCategory(selectedImageTask?.attachments || []);
  const selectedAnnotations = selectedImageTask ? (annotationDrafts[selectedImageTask.id] || []) : [];
  const canSelectedReview = selectedImageTask && (isDesignManager || isAdmin) && selectedImageTask.status === "SUBMITTED_FOR_REVIEW";
  const canSelectedUploadCompleted = !!selectedImageTask && ((isDesigner && selectedImageTask.designerId === currentUser?.id) || isAdmin);
  const archivedStage = ["DESIGN_APPROVED", "COMPLETED", "CANCELLED"].includes(task.workflowStatus) || ["APPROVED", "COMPLETED"].includes(selectedImageTask?.status || "");
  const draftWorkbenchStage = !!selectedImageTask && !!canEditDraft;
  const opsReviewWorkbenchStage = !!selectedImageTask && task.workflowStatus === "SUBMITTED" && (isOpsManager || isAdmin);
  const designerProductionStage = !!selectedImageTask && !archivedStage && ((isDesigner && selectedImageTask.designerId === currentUser?.id) || isAdmin) && ["NOT_STARTED", "IN_PROGRESS", "REVISION_REQUIRED"].includes(selectedImageTask.status);
  const designReviewWorkbenchStage = !!canSelectedReview && !archivedStage;
  const showCompletedAssets = archivedStage || designerProductionStage || designReviewWorkbenchStage;
  const showCompletedUpload = showCompletedAssets && !archivedStage && canSelectedUploadCompleted && designerProductionStage;
  const getPasteUploadCategory = (forcedCategory?: string) => {
    if (!selectedImageTask) return null;
    if (forcedCategory === "IMAGE_ORIGINAL") return draftWorkbenchStage ? forcedCategory : null;
    if (forcedCategory === "IMAGE_REFERENCE") return draftWorkbenchStage ? forcedCategory : null;
    if (forcedCategory === "IMAGE_COMPLETED") return showCompletedUpload ? forcedCategory : null;
    if (draftWorkbenchStage && (imageSourceType === "original" || imageSourceType === "reference")) return "IMAGE_REFERENCE";
    if (showCompletedUpload && imageSourceType === "completed") return "IMAGE_COMPLETED";
    return null;
  };
  const handleWorkbenchPaste = async (event: ClipboardEvent<HTMLDivElement>, forcedCategory?: string) => {
    if (!selectedImageTask) return;
    const target = event.target as HTMLElement | null;
    const isEditingText = !!target?.closest("input, textarea, [contenteditable='true']");
    const category = getPasteUploadCategory(forcedCategory);
    if (!category) {
      if (isEditingText) return;
      message.info("当前阶段不支持粘贴上传图片。");
      return;
    }
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => PASTE_IMAGE_TYPES.includes(item.type));
    if (!imageItem) {
      if (isEditingText) return;
      message.info("剪贴板中没有可上传的图片。");
      return;
    }
    const blob = imageItem.getAsFile();
    if (!blob) {
      message.info("剪贴板中没有可上传的图片。");
      return;
    }
    event.preventDefault();
    const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] || "png";
    const file = new File([blob], `pasted-${Date.now()}.${extension}`, { type: blob.type });
    await uploadImageAttachment(selectedImageTask, category, file);
  };
  const annotationMode = canEditDraft ? "edit" : (isDesignManager || isOpsManager || isAdmin) ? "review" : "view";
  const batchAssignableRows = (task.imageTasks || []).filter(isBatchAssignableImageTask);
  const allBatchRowsChecked = batchAssignableRows.length > 0 && batchAssignableRows.every((row: any) => checkedImageTaskIds.includes(row.id));

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={goBack}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>法旨详情</Title>
        <Tag color="blue">{taskStatusLabels[task.workflowStatus] || task.workflowStatus}</Tag>
      </Space>

      <Card
        style={{ marginBottom: 16 }}
        title={task.serialNumber}
        extra={(
          <Space wrap>
            {canEditDraft && <Button icon={<SaveOutlined />} onClick={() => saveMainTask()}>保存主单信息</Button>}
            {canSubmitOps && <Button type="primary" icon={<SendOutlined />} onClick={submitApproval}>提交运营主管审批</Button>}
            {canWithdraw && <Button icon={<RollbackOutlined />} onClick={withdrawApproval}>撤回修改</Button>}
            {canOpsApprove && <Button type="primary" icon={<CheckOutlined />} onClick={approveTask}>审批通过</Button>}
            {canOpsApprove && <Button danger icon={<StopOutlined />} onClick={rejectTask}>退回修改</Button>}
            {canDeleteDraftTask && (
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [{ key: "delete", danger: true, icon: <DeleteOutlined />, label: "删除草稿" }],
                  onClick: ({ key }) => { if (key === "delete") deleteDraftTask(); },
                }}
              >
                <Button icon={<MoreOutlined />}>更多操作</Button>
              </Dropdown>
            )}
          </Space>
        )}
      >
        {canEditDraft && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="填写后请先保存，再返回或提交。" />}
        <Descriptions column={{ xs: 1, md: 4 }} size="small" bordered style={{ marginBottom: 12 }}>
          <Descriptions.Item label="状态">{taskStatusLabels[task.workflowStatus] || task.workflowStatus}</Descriptions.Item>
          <Descriptions.Item label="店铺">
            {canEditDraft ? (
              <Select allowClear style={{ minWidth: 160 }} value={mainDraft.storeId || undefined} placeholder="选择店铺" options={stores.map((store) => ({ value: store.id, label: store.name }))} onChange={(value) => updateMainDraft({ storeId: value })} />
            ) : (task.store?.name || "-")}
          </Descriptions.Item>
          <Descriptions.Item label="产品编号">
            {canEditDraft ? <Input value={mainDraft.productCode || ""} onChange={(event) => updateMainDraft({ productCode: event.target.value })} /> : (task.productCode || "-")}
          </Descriptions.Item>
          <Descriptions.Item label="兼容产品">
            {canEditDraft ? <Input value={mainDraft.compatibleProduct || ""} onChange={(event) => updateMainDraft({ compatibleProduct: event.target.value })} /> : (task.compatibleProduct || task.productName || "-")}
          </Descriptions.Item>
          <Descriptions.Item label="需求人">
            {canEditDraft ? <Input value={mainDraft.requesterName || ""} onChange={(event) => updateMainDraft({ requesterName: event.target.value })} /> : displayRequester(task)}
          </Descriptions.Item>
          <Descriptions.Item label="是否加急">
            {canEditDraft ? (
              <Switch checkedChildren="加急" unCheckedChildren="普通" checked={(mainDraft.priority || "NORMAL") === "URGENT"} onChange={(checked) => updateMainDraft({ priority: checked ? "URGENT" : "NORMAL" })} />
            ) : (task.priority === "URGENT" ? <Tag color="red">加急</Tag> : "普通")}
          </Descriptions.Item>
          <Descriptions.Item label="需求张数">
            {canEditDraft ? <InputNumber min={1} max={200} value={Number(mainDraft.imageCount || 1)} onChange={(value) => updateMainDraft({ imageCount: value || 1 })} /> : (task.imageCount || task.imageTasks?.length || 0)}
          </Descriptions.Item>
          <Descriptions.Item label="图片尺寸 / 输出规格说明">
            {canEditDraft ? <Input value={mainDraft.imageSize || ""} onChange={(event) => updateMainDraft({ imageSize: event.target.value })} /> : (task.imageSize || "-")}
          </Descriptions.Item>
          <Descriptions.Item label="需求类型">
            {canEditDraft ? (
              <Select
                allowClear
                style={{ minWidth: 180 }}
                placeholder="选择需求类型"
                value={mainDraft.requirementTypeId || undefined}
                options={requirementTypes.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(value) => updateMainDraft({ requirementTypeId: value || null })}
              />
            ) : (task.requirementType?.name || "-")}
          </Descriptions.Item>
        </Descriptions>
        <Collapse
          ghost
          items={[{
            key: "more",
            label: "展开更多",
            children: (
              <Descriptions column={{ xs: 1, md: 3 }} size="small" bordered>
                <Descriptions.Item label="兼容产品图链接" span={3}>
                  {canEditDraft ? (
                    <Space.Compact style={{ width: "100%" }}>
                      <Input.TextArea rows={5} placeholder="一行一个链接，可填写兼容产品图、产品参考图或相关图片链接" value={materialLinks} onChange={(event) => setMaterialLinks(event.target.value)} />
                      <Button icon={<SaveOutlined />} onClick={saveTaskLinks}>保存链接</Button>
                    </Space.Compact>
                  ) : (task.materialLinks || "-")}
                </Descriptions.Item>
              </Descriptions>
            ),
          }]}
        />
      </Card>

      {selectedImageTask && (
        <Card
          style={{ marginBottom: 16 }}
          title={(
            <Row align="middle" justify="space-between" gutter={[12, 8]} style={{ width: "100%" }}>
              <Col flex="auto">
                <Space size={8} wrap={false}>
                  <Text>图片名称：</Text>
                  <Input
                    disabled={!canEditDraft}
                    value={getRowValue(selectedImageTask, "imageTitle") || ""}
                    placeholder={`图片 ${selectedImageTask.imageIndex}`}
                    onChange={(event) => updateRowDraft(selectedImageTask.id, { imageTitle: event.target.value })}
                    style={{ width: 260 }}
                  />
                </Space>
              </Col>
              <Col>
                <Space>
                  {canEditDraft && <Button size="small" icon={<SaveOutlined />} onClick={() => saveImageTask(selectedImageTask)}>保存图片需求</Button>}
                  {designerProductionStage && selectedImageTask.status !== "IN_PROGRESS" && <Button size="small" type="primary" onClick={startSelectedImageTask}>开始制作</Button>}
                  {designerProductionStage && selectedImageTask.status === "IN_PROGRESS" && <Button size="small" type="primary" icon={<SendOutlined />} onClick={submitSelectedImageTask}>提交审核</Button>}
                  {designReviewWorkbenchStage && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => reviewSelectedImageTask(true)}>审核通过</Button>}
                  {designReviewWorkbenchStage && <Button size="small" danger icon={<StopOutlined />} onClick={() => reviewSelectedImageTask(false)}>退回修改</Button>}
                  <Button size="small" onClick={() => setSelectedImageTaskId(null)}>收起工作台</Button>
                </Space>
              </Col>
            </Row>
          )}
        >
          <div onPaste={handleWorkbenchPaste} tabIndex={0} style={{ outline: "none" }}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Card size="small" title="需求说明">
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <div>
                  <Text type="secondary">修改要求 / 画面描述</Text>
                  {canEditDraft ? (
                    <Input.TextArea
                      rows={4}
                      style={{ marginTop: 6 }}
                      value={getRowValue(selectedImageTask, "requirement") || ""}
                      placeholder={isPersonalizedRequirement(getRowValue(selectedImageTask, "requirementType")) ? "可补充：整体风格色调、产品使用场景、产品特点体现、摆放要求、是否需要人物、图片细节、文案内容等。" : "填写该图片的具体修改要求；如单张尺寸不同，也写在这里"}
                      onChange={(event) => updateRowDraft(selectedImageTask.id, { requirement: event.target.value })}
                    />
                  ) : <div style={{ marginTop: 6 }}>{selectedImageTask.requirement || "-"}</div>}
                </div>
                <div>
                  <Text type="secondary">原图链接</Text>
                  {canEditDraft ? (
                    <Input.TextArea
                      rows={2}
                      style={{ marginTop: 6 }}
                      value={getRowValue(selectedImageTask, "originalImageUrl") || ""}
                      placeholder="可填写原始产品图、网盘链接、网页链接等，一行一个链接"
                      onChange={(event) => updateRowDraft(selectedImageTask.id, { originalImageUrl: event.target.value })}
                    />
                  ) : <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{selectedImageTask.originalImageUrl || "-"}</div>}
                </div>
                <div>
                  <Text type="secondary">参考图链接</Text>
                  {canEditDraft ? (
                    <Input.TextArea
                      rows={2}
                      style={{ marginTop: 6 }}
                      value={getRowValue(selectedImageTask, "referenceImageUrl") || ""}
                      placeholder="可填写参考图片、竞品图片、风格参考链接等，一行一个链接"
                      onChange={(event) => updateRowDraft(selectedImageTask.id, { referenceImageUrl: event.target.value })}
                    />
                  ) : <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{selectedImageTask.referenceImageUrl || "-"}</div>}
                </div>
                <Text type="secondary">如有图片文案，也写在修改要求中。</Text>
                {(designReviewWorkbenchStage || archivedStage) && selectedImageTask.reviewRemark && (
                  <Text>审核意见：{selectedImageTask.reviewRemark}</Text>
                )}
              </Space>
            </Card>

            <Card
              size="small"
              title="参考图"
              extra={((selectedGrouped.IMAGE_ORIGINAL || []).length || (selectedGrouped.IMAGE_REFERENCE || []).length) ? <Button size="small" onClick={() => setAnnotationExpanded((prev) => !prev)}>{canEditDraft ? "编辑标注" : "查看标注"}</Button> : null}
              onClick={() => setImageSourceType("reference")}
              onPaste={(event) => handleWorkbenchPaste(event, "IMAGE_REFERENCE")}
            >
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {opsReviewWorkbenchStage && <Text type="secondary">请核对参考图、需求说明和标注内容。</Text>}
                {draftWorkbenchStage && <Text type="secondary">支持点击上传，也可 Ctrl + V 粘贴图片。</Text>}
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={showCompletedAssets ? 12 : 24}>
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                      <AttachmentGallery
                        items={[...(selectedGrouped.IMAGE_ORIGINAL || []), ...(selectedGrouped.IMAGE_REFERENCE || [])]}
                        sourceType="reference"
                        allowDelete={!!canEditDraft}
                        emptyText="暂无参考图"
                      />
                      {canEditDraft && <UploadButton label="上传参考图" onFile={(file) => uploadImageAttachment(selectedImageTask, "IMAGE_REFERENCE", file)} />}
                    </Space>
                  </Col>
                  {showCompletedAssets && (
                    <Col xs={24} md={12}>
                      <Card
                        size="small"
                        title={"\u5b8c\u6210\u7a3f\u9884\u89c8"}
                        onClick={() => setImageSourceType("completed")}
                        onPaste={(event) => handleWorkbenchPaste(event, "IMAGE_COMPLETED")}
                      >
                        <Space direction="vertical" size={8} style={{ width: "100%" }}>
                          <AttachmentGallery
                            items={selectedGrouped.IMAGE_COMPLETED || []}
                            sourceType="completed"
                            allowDelete={showCompletedUpload}
                            emptyText={designReviewWorkbenchStage ? "暂无完成稿，请等待设计师提交" : "暂无完成稿"}
                          />
                          {showCompletedUpload && <UploadButton label="上传完成稿" onFile={(file) => uploadImageAttachment(selectedImageTask, "IMAGE_COMPLETED", file)} />}
                        </Space>
                      </Card>
                    </Col>
                  )}
                </Row>
              </Space>
            </Card>

            {annotationExpanded && (
              <Card
                size="small"
                title="标注"
                extra={<Button size="small" onClick={() => setAnnotationExpanded(false)}>收起标注</Button>}
              >
                {!workbenchImage.url ? (
                  <Text type="secondary">暂无可标注图片，请先上传参考图。</Text>
                ) : (
                  <ImageAnnotationViewer
                    mode={annotationMode as any}
                    imageUrl={workbenchImage.url}
                    imageTitle={workbenchImage.title || selectedImageTask.imageTitle}
                    annotations={selectedAnnotations}
                    onChange={(items) => setAnnotationDrafts((prev) => ({ ...prev, [selectedImageTask.id]: items }))}
                    onSave={(items) => saveAnnotations(selectedImageTask.id, items)}
                  />
                )}
              </Card>
            )}

          </Space>
          </div>
        </Card>
      )}

      {(isOpsManager || isOperator || isAdmin) && (
        <Card title="提交与退回记录" style={{ marginBottom: 16 }}>
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {(task.submissionRecords || []).map((record: any) => (
              <div key={`submission-${record.id}`} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <Tag color={record.submissionType === "RESUBMIT" ? "orange" : "blue"}>{record.submissionType === "RESUBMIT" ? "退回后重提" : "首次提交"}</Tag>
                <Text>第 {record.submissionSequence} 次提交</Text>
                <Text type="secondary">提交人：{displayUserName(record.submitter)}</Text>
                <Text type="secondary">提交时间：{record.submittedAt ? new Date(record.submittedAt).toLocaleString("zh-CN") : "-"}</Text>
                <Tag>{record.result}</Tag>
              </div>
            ))}
            {(task.approvalRecords || []).map((record: any) => (
              <Alert
                key={`approval-${record.id}`}
                type={record.action === "OPS_REJECTED" ? "warning" : "success"}
                showIcon
                message={record.action === "OPS_REJECTED" ? "运营主管退回补充" : "运营主管审批放行"}
                description={`${record.comment || "无备注"} · ${displayUserName(record.approver)} · ${record.createdAt ? new Date(record.createdAt).toLocaleString("zh-CN") : "-"}`}
              />
            ))}
            {(task.auditEvents || []).filter((event: any) => event.action === "ops_approval_rejected").map((event: any) => {
              let metadata: any = {};
              try { metadata = event.metadata ? JSON.parse(event.metadata) : {}; } catch { metadata = {}; }
              return <Text key={`return-detail-${event.id}`} type="secondary">问题图片：{(metadata.issueImageTaskIds || []).length ? (metadata.issueImageTaskIds || []).join("、") : "未指定"}；问题类型：{(metadata.issueTypes || []).length ? (metadata.issueTypes || []).join("、") : "未指定"}</Text>;
            })}
            {!task.submissionRecords?.length && !task.approvalRecords?.length && <Text type="secondary">暂无提交或退回记录</Text>}
          </Space>
        </Card>
      )}

      <Card
        title={`图片任务明细 (${task.imageTasks?.length || 0})`}
      >
        {canEditDraft && <Text type="secondary">统一尺寸写主单，单张特殊尺寸写在对应图片要求中。</Text>}
        {canDesignAssign && (
          <Card size="small" style={{ marginBottom: 12, background: "#fafafa" }}>
            <Row gutter={[12, 12]} align="middle">
              <Col xs={24} md={8}>
                <Checkbox
                  checked={allBatchRowsChecked}
                  indeterminate={checkedImageTaskIds.length > 0 && !allBatchRowsChecked}
                  onChange={(event) => setCheckedImageTaskIds(event.target.checked ? batchAssignableRows.map((row: any) => row.id) : [])}
                >
                  选择待分配图片任务
                </Checkbox>
                <Text type="secondary" style={{ marginLeft: 8 }}>已选 {checkedImageTaskIds.length} 项</Text>
              </Col>
              <Col xs={24} md={8}>
                <Select
                  allowClear
                  style={{ width: "100%" }}
                  value={batchDesignerId}
                  placeholder="批量选择设计师"
                  onChange={setBatchDesignerId}
                  options={designers.map((user: any) => ({ value: user.userId ?? user.id, label: `${user.name || displayUserName(user)}（${user.username}）` }))}
                />
              </Col>
              <Col xs={24} md={8}>
                <Popconfirm title="确认批量分配选中的图片任务？" onConfirm={batchAssignDesigner}>
                  <Button type="primary">批量分配</Button>
                </Popconfirm>
                <Text type="secondary" style={{ marginLeft: 8 }}>仅待分配且未分配任务可选</Text>
              </Col>
            </Row>
          </Card>
        )}

        {(task.imageTasks || []).length ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {(task.imageTasks || []).map((row: any) => {
              const grouped = groupByCategory(row.attachments || []);
              const batchAssignable = isBatchAssignableImageTask(row);
              const originalCount = (grouped.IMAGE_ORIGINAL || []).length;
              const referenceCount = (grouped.IMAGE_REFERENCE || []).length;
              const completedCount = (grouped.IMAGE_COMPLETED || []).length;
              const showListDesigner = !["WAITING_OPS_APPROVAL", "PENDING_ASSIGNMENT"].includes(row.status);
              const showListCompleted = !["WAITING_OPS_APPROVAL", "PENDING_ASSIGNMENT", "NOT_STARTED"].includes(row.status) || ["DESIGN_APPROVED", "COMPLETED"].includes(task.workflowStatus);
              return (
                <Card
                  key={row.id}
                  size="small"
                  title={
                    <Space wrap>
                      {canDesignAssign && (
                        <Checkbox
                          disabled={!batchAssignable}
                          checked={checkedImageTaskIds.includes(row.id)}
                          onChange={(event) => toggleBatchImageTask(row, event.target.checked)}
                        />
                      )}
                      <Text strong>#{row.imageIndex} {row.imageTitle || `图片 ${row.imageIndex}`}</Text>
                      <Tag color={imageStatusColors[row.status]}>{imageStatusLabels[row.status] || row.status}</Tag>
                    </Space>
                  }
                  extra={<Button size="small" type={row.id === selectedImageTaskId ? "primary" : "default"} onClick={() => openImageTaskWorkbench(row)}>进入工作台</Button>}
                >
                  <Row gutter={[16, 12]} align="middle">
                    <Col xs={24} md={5}>
                      <Text type="secondary">需求类型：</Text><Text>{row.requirementType || "-"}</Text>
                    </Col>
                    {showListDesigner && (
                      <Col xs={24} md={5}>
                        <Text type="secondary">当前设计师：</Text><Text>{displayUserName(row.designer, "-")}</Text>
                      </Col>
                    )}
                    <Col xs={24} md={6}>
                      <Space wrap>
                        <Tag color={originalCount ? "green" : "default"}>原图：{originalCount ? "已上传" : "未上传"}</Tag>
                        <Tag color={referenceCount ? "green" : "default"}>参考图：{attachmentCountLabel(grouped.IMAGE_REFERENCE)}</Tag>
                        {showListCompleted && <Tag color={completedCount ? "green" : "default"}>完成稿：{completedCount ? "已上传" : "未上传"}</Tag>}
                      </Space>
                    </Col>
                    <Col xs={24} md={8}>
                      <Text type="secondary">修改要求：</Text>
                      <Text>{row.requirement ? (row.requirement.length > 60 ? `${row.requirement.slice(0, 60)}...` : row.requirement) : "-"}</Text>
                    </Col>
                  </Row>
                </Card>
              );
            })}
          </Space>
        ) : (
          <Text type="secondary">{isDesigner ? "暂无分配给你的图片任务，等待设计主管分配" : "暂无图片任务，可在草稿或退回状态新增图片任务"}</Text>
        )}
      </Card>

      <Modal
        open={preview.open}
        title={preview.title || "完成稿预览"}
        footer={null}
        onCancel={() => setPreview((prev) => ({ ...prev, open: false }))}
        width={900}
      >
        {preview.url && <Image src={preview.url} alt={preview.title || "preview"} style={{ maxWidth: "100%" }} />}
      </Modal>
    </div>
  );
}
