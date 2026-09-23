'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Checkbox, Col, Dropdown, Input, Modal, Pagination, Popconfirm, Row, Segmented, Select, Space, Tag, Tooltip, Typography, message } from "antd";
import { DownloadOutlined, EyeOutlined, MoreOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { authApi, getErrorMessage, imageTaskApi, taskApi, userApi } from "@/lib/api";
import { displayRequester, displayUserName } from "@/lib/display";
import TaskAssignmentModal from "@/components/TaskAssignmentModal";
import OperatorDecreeList from "@/components/operator-dashboard/OperatorDecreeList";
import {
  DataTableCard,
  FilterCard,
  SecondaryEmptyState,
  SecondaryPageHeader,
  SecondaryPageShell,
  SecondaryStatusTag,
} from "@/components/secondary-page";
import { useDashboardRefresh } from "@/hooks/useDashboardRefresh";

const { Text } = Typography;

const statusLabels: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待运营主管审批",
  OPS_REJECTED: "运营主管退回",
  OPS_APPROVED: "已通过待设计分配",
  DESIGN_ASSIGNED: "已分配设计",
  IN_DESIGN: "设计中",
  DESIGN_REVIEW: "待设计审核",
  DESIGN_APPROVED: "已完成",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const roleLabels: Record<string, string> = {
  ADMIN: "管理员",
  SUPER_ADMIN: "管理员",
  OPERATION: "普通运营",
  OPERATION_MANAGER: "运营主管",
  DESIGN_MANAGER: "设计主管",
  DESIGNER: "设计师",
};

const designerImageStatusOptions = [
  { value: "NOT_STARTED", label: "待开始" },
  { value: "IN_PROGRESS", label: "设计中" },
  { value: "REVISION_REQUIRED", label: "退回修改" },
  { value: "SUBMITTED_FOR_REVIEW", label: "待审核" },
  { value: "APPROVED", label: "已完成" },
];

const DESIGN_VISIBLE = ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "COMPLETED"];
const ARCHIVE_STATUSES = ["DESIGN_APPROVED", "COMPLETED", "CANCELLED"];
const SUPERVISOR_SCOPES = ["ops-approvals", "approval-history", "design-flow-history", "design-assignment", "design-reviews", "design-tasks"];
const LIST_SCOPES = ["processing", "drafts", "archived", ...SUPERVISOR_SCOPES];

function normalizeStatus(value: string | null) {
  return value && statusLabels[value] ? value : undefined;
}

function ownerLabel(row: any) {
  const assigned = row.imageTasks?.find((it: any) => it.designerId)?.designerId;
  if (DESIGN_VISIBLE.includes(row.workflowStatus)) {
    return assigned ? "设计侧" : "设计主管";
  }
  return row.operatorOwner || displayUserName(row.creator, "-");
}

function csvValue(value: any) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function FazhiListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [filters, setFilters] = useState<any>({ page: 1, pageSize: 20, scope: "processing" });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [designers, setDesigners] = useState<any[]>([]);
  const [assignment, setAssignment] = useState<{ taskIds: number[]; mode: "ASSIGN" | "REASSIGN" } | null>(null);
  const [review, setReview] = useState<{ taskIds: number[]; action: "APPROVE" | "REJECT"; imageTaskId?: number } | null>(null);
  const [reviewRemark, setReviewRemark] = useState("");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const role = currentUser?.role || "";
  const isAdmin = ["OWNER", "SUPER_ADMIN"].includes(role);
  const canCreateTask = role === "OPERATION" || isAdmin;
  const canAccessDrafts = role === "OPERATION" || isAdmin;
  const isDraftScope = filters.scope === "drafts";
  const isArchivedScope = filters.scope === "archived";
  const isOpsApprovalScope = filters.scope === "ops-approvals";
  const isSupervisorScope = SUPERVISOR_SCOPES.includes(filters.scope);
  const showAssignedDesigner = (role === "DESIGN_MANAGER" || isAdmin) && filters.scope === "design-tasks";
  const canExport = ["OPERATION_MANAGER", "DESIGN_MANAGER"].includes(role) || isAdmin;
  const canBatchPriorityRole = ["OPERATION", "OPERATION_MANAGER", "DESIGN_MANAGER"].includes(role) || isAdmin;

  const syncUrl = (next: any) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.search) params.set("search", next.search);
    if (next.priority) params.set("priority", next.priority);
    if (next.imageStatus) params.set("imageStatus", next.imageStatus);
    if (next.taskStatus) params.set("taskStatus", next.taskStatus);
    if (next.imageGroup) params.set("imageGroup", next.imageGroup);
    if (next.statusGroup) params.set("statusGroup", next.statusGroup);
    if (next.approvalAction) params.set("approvalAction", next.approvalAction);
    if (next.queueFilter) params.set("queueFilter", next.queueFilter);
    params.set("scope", next.scope || "processing");
    if (next.mine) params.set("mine", next.mine);
    if (next.scope) params.set("scope", next.scope);
    if (next.page && next.page !== 1) params.set("page", String(next.page));
    if (next.pageSize && next.pageSize !== 20) params.set("pageSize", String(next.pageSize));
    const query = params.toString();
    router.replace(query ? `/dashboard/fazhi?${query}` : "/dashboard/fazhi", { scroll: false });
  };

  const applyFilters = (next: any, shouldLoad = true) => {
    if (next.imageStatus) next = { ...next, taskStatus: next.imageStatus };
    setFilters(next);
    syncUrl(next);
    if (shouldLoad) loadData(next);
  };

  const loadData = useCallback(async (next: any) => {
    setLoading(true);
    try {
      const requestFilters = { ...next };
      delete requestFilters.taskStatus;
      const res = next.scope === "ops-approvals"
        ? await taskApi.findOpsApprovalQueue(requestFilters)
        : await taskApi.findAll(requestFilters);
      setData(res.data.data || res.data);
      setSelectedIds([]);
    } catch (err) {
      console.error("[fazhi-list] load failed", err);
      message.error(getErrorMessage(err, "加载法旨失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    authApi.getMe().then((res) => setCurrentUser(res.data.data || res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (role === "DESIGN_MANAGER" || isAdmin) {
      userApi.findDesigners().then((res) => setDesigners(res.data.data || res.data || [])).catch(() => setDesigners([]));
    }
  }, [role, isAdmin]);

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    const initialFilters = {
      page: Number(params.get("page") || 1),
      pageSize: Number(params.get("pageSize") || 20),
      scope: LIST_SCOPES.includes(params.get("scope") || "")
        ? params.get("scope")
        : params.get("view") === "archive" ? "archived" : "processing",
      status: normalizeStatus(params.get("status")),
      search: params.get("search") || undefined,
      priority: params.get("priority") || undefined,
      imageStatus: params.get("taskStatus") || params.get("imageStatus") || undefined,
      taskStatus: params.get("taskStatus") || undefined,
      imageGroup: params.get("imageGroup") || undefined,
      statusGroup: params.get("statusGroup") || undefined,
      approvalAction: params.get("approvalAction") || undefined,
      queueFilter: params.get("queueFilter") || undefined,
      mine: params.get("mine") || undefined,
    };
    setFilters(initialFilters);
    loadData(initialFilters);
  }, [queryString, loadData]);

  const refreshList = useCallback(() => loadData(filters), [filters, loadData]);

  useDashboardRefresh({ refreshCore: refreshList });

  const setFilter = (patch: any) => setFilters((prev: any) => ({ ...prev, ...patch }));
  const search = () => applyFilters({ ...filters, page: 1 });

  const canSetPriority = (row: any) => {
    if (isArchivedScope || ARCHIVE_STATUSES.includes(row.workflowStatus)) return false;
    if (!canBatchPriorityRole) return false;
    if (isAdmin) return true;
    if (role === "OPERATION") return !DESIGN_VISIBLE.includes(row.workflowStatus);
    return true;
  };

  const canAssignDesign = (row: any) => (role === "DESIGN_MANAGER" || isAdmin) && row.workflowStatus === "OPS_APPROVED" && (row.imageTasks || []).some((item: any) => item.status === "PENDING_ASSIGNMENT" && !item.designerId);
  const canReassignDesign = (row: any) => (role === "DESIGN_MANAGER" || isAdmin) && row.workflowStatus === "DESIGN_ASSIGNED" && (row.imageTasks || []).some((item: any) => item.status === "NOT_STARTED" && item.designerId);
  const canReviewDesign = (row: any) => (role === "DESIGN_MANAGER" || isAdmin) && row.workflowStatus === "DESIGN_REVIEW" && (row.imageTasks || []).some((item: any) => item.status === "SUBMITTED_FOR_REVIEW");
  const selectionRows = (data.items || []).filter((row: any) => selectedIds.includes(row.id));
  const batchEligible = (workflowStatus: string) => selectionRows.length > 0 && selectionRows.every((row: any) => row.workflowStatus === workflowStatus);
  const batchReason = (workflowStatus: string) => !selectionRows.length ? "请先选择法旨" : batchEligible(workflowStatus) ? "" : "选中项包含不符合当前操作状态的法旨";


  const submitReview = async () => {
    if (!review) return;
    if (review.action === "REJECT" && !reviewRemark.trim()) return message.warning("请填写退回原因");
    try {
      if (review.imageTaskId) {
        if (review.action === "APPROVE") await imageTaskApi.approveReview(review.imageTaskId, reviewRemark.trim() || undefined);
        else await imageTaskApi.rejectReview(review.imageTaskId, reviewRemark.trim());
      } else {
        await imageTaskApi.batchReviewTasks({ taskIds: review.taskIds, action: review.action, remark: reviewRemark.trim() || undefined });
      }
      message.success(review.action === "APPROVE" ? "审核已通过" : "已退回修改");
      setReview(null); setReviewRemark(""); loadData(filters);
    } catch (err) { message.error(getErrorMessage(err)); }
  };

  const openSingleImageReview = (row: any, action: "APPROVE" | "REJECT") => {
    const submittedImageTasks = (row.imageTasks || []).filter((item: any) => item.status === "SUBMITTED_FOR_REVIEW");
    if (submittedImageTasks.length !== 1) {
      message.warning("请进入法旨详情逐张审核图片任务");
      return;
    }
    setReview({ taskIds: [], imageTaskId: submittedImageTasks[0].id, action });
  };

  const selectableRows = useMemo(() => (data.items || []).filter(canSetPriority), [data.items, role]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((row: any) => selectedIds.includes(row.id));

  const toggleRow = (row: any, checked: boolean) => {
    setSelectedIds((prev) => checked ? Array.from(new Set([...prev, row.id])) : prev.filter((id) => id !== row.id));
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? selectableRows.map((row: any) => row.id) : []);
  };

  const batchPriority = async (priority: "URGENT" | "NORMAL") => {
    if (!selectedIds.length) {
      message.warning("请选择需要设置优先级的法旨");
      return;
    }
    try {
      const res = await taskApi.batchPriority({ taskIds: selectedIds, priority });
      const result = res.data.data || res.data;
      message.success(`批量设置完成：成功 ${result.successCount}，失败 ${result.failedCount}`);
      loadData(filters);
    } catch (err) {
      console.error("[fazhi-list] batch priority failed", err);
      message.error(getErrorMessage(err));
    }
  };

  const batchDelete = async () => {
    if (!selectedIds.length) return;
    try {
      const res = await taskApi.batchDelete({ taskIds: selectedIds });
      const result = res.data.data || res.data;
      message.success(`成功删除 ${result.successCount} 条，${result.failedCount} 条因权限或状态限制未删除`);
      loadData(filters);
    } catch (err) {
      console.error("[fazhi-list] batch delete failed", err);
      message.error(getErrorMessage(err, "批量删除失败，请稍后重试"));
    }
  };

  const canDeleteTask = (row: any) => {
    if (!["DRAFT", "OPS_REJECTED"].includes(row.workflowStatus)) return false;
    if (isAdmin) return true;
    return role === "OPERATION" && row.creator?.id === currentUser?.id;
  };

  const deleteTask = async (row: any) => {
    try {
      await taskApi.remove(row.id);
      message.success("已删除");
      loadData(filters);
    } catch (err) {
      console.error("[fazhi-list] delete failed", err);
      message.error(getErrorMessage(err, "删除失败，请稍后重试"));
    }
  };

  const canApproveTask = (row: any) => (isAdmin || role === "OPERATION_MANAGER") && row.workflowStatus === "SUBMITTED";
  const isApprovedTask = (row: any) => ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "COMPLETED"].includes(row.workflowStatus);
  const canRollbackApproval = (row: any) => (isAdmin || role === "OPERATION_MANAGER") && row.workflowStatus === "OPS_APPROVED" && (row.imageTasks || []).every((item: any) => item.status === "PENDING_ASSIGNMENT" && !item.designerId);

  const approveTask = async (row: any) => {
    try {
      await taskApi.approve(row.id);
      message.success("已审批");
      loadData(filters);
    } catch (err) {
      console.error("[fazhi-list] approve failed", err);
      message.error(getErrorMessage(err, "审批失败，请稍后重试"));
    }
  };

  const rollbackApproval = async (row: any) => {
    if (!canRollbackApproval(row)) {
      message.warning("当前法旨已进入后续流程，不能在列表中回退审批，请进入详情页处理。");
      return;
    }
    try {
      await taskApi.rollbackApproval(row.id);
      message.success("审批已回退");
      loadData(filters);
    } catch (err) {
      console.error("[fazhi-list] rollback approval failed", err);
      message.error(getErrorMessage(err, "审批回退失败，请稍后重试"));
    }
  };

  const resetFilters = () => {
    const next = { page: 1, pageSize: filters.pageSize || 20, scope: filters.scope || "processing" };
    applyFilters(next);
  };

  const openDetail = (row: any) => {
    const returnTo = typeof window === "undefined"
      ? "/dashboard/fazhi"
      : `${window.location.pathname}${window.location.search}`;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(`tianji:fazhi-list:${returnTo}`, JSON.stringify({ scrollTop: window.scrollY, focusId: row.id }));
    }
    router.push(`/dashboard/fazhi/${row.id}?returnTo=${encodeURIComponent(returnTo)}&returnFocus=${row.id}`, { scroll: false });
  };

  useEffect(() => {
    const focusId = Number(searchParams.get("returnFocus"));
    const contextKey = `tianji:fazhi-list:${typeof window === "undefined" ? "/dashboard/fazhi" : `${window.location.pathname}${window.location.search}`}`;
    let context: { scrollTop?: number; focusId?: number } | null = null;
    try { context = JSON.parse(sessionStorage.getItem(contextKey) || "null"); } catch { context = null; }
    const targetId = focusId || context?.focusId;
    if (loading || !targetId || !(data.items || []).some((row: any) => row.id === targetId)) return;
    setHighlightedId(targetId);
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: context?.scrollTop || 0, behavior: "auto" }));
    const timer = window.setTimeout(() => {
      setHighlightedId(null);
      sessionStorage.removeItem(contextKey);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("returnFocus");
      router.replace(params.toString() ? `/dashboard/fazhi?${params}` : "/dashboard/fazhi", { scroll: false });
    }, 2600);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [data.items, loading, router, searchParams]);

  const exportCsv = async () => {
    try {
      const pageSize = 100;
      let page = 1;
      let total = 0;
      const items: any[] = [];
      do {
        const res = await taskApi.findAll({ ...filters, page, pageSize });
        const payload = res.data.data || res.data;
        items.push(...(payload.items || []));
        total = payload.total || items.length;
        page += 1;
      } while (items.length < total);
      const rows = [
        ["法旨编号", "店铺", "产品编号", "兼容产品", "需求人", "需求张数", "总交付张数", "当前状态", "当前负责人", "优先级", "创建时间"],
        ...items.map((row: any) => [
          row.serialNumber,
          row.store?.name || "-",
          row.productCode || "-",
          row.productName || "-",
          displayRequester(row),
          row.imageCount || row._count?.imageTasks || 0,
          row._count?.imageTasks || row.imageTasks?.length || 0,
          statusLabels[row.workflowStatus] || row.workflowStatus,
          ownerLabel(row),
          row.priority === "URGENT" ? "加急" : "普通",
          row.createdAt ? new Date(row.createdAt).toLocaleString("zh-CN") : "-",
        ]),
      ];
      const csv = "\uFEFF" + rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
      const url = window.URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `fazhi-export-${Date.now()}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[fazhi-list] export failed", err);
      message.error(getErrorMessage(err, "导出失败，请稍后重试"));
    }
  };

  const items = data.items || [];
  const scopeCounts = data.scopeCounts || {};
  const statusOptions = Object.entries(statusLabels)
    .filter(([value]) => isDraftScope ? value === "DRAFT" : isArchivedScope ? ARCHIVE_STATUSES.includes(value) : value !== "DRAFT" && !ARCHIVE_STATUSES.includes(value))
    .map(([value, label]) => ({ value, label }));

  if (role === "OPERATION") return <OperatorDecreeList organizationIdentity={currentUser?.organizationIdentity} />;

  if (isOpsApprovalScope) {
    const queueItems = data.items || [];
    const queueSummary = data.summary || {};
    return (
      <SecondaryPageShell>
        <SecondaryPageHeader
          breadcrumb={<span>工作台 / 法旨 / 待运营主管审批</span>}
          title="待运营主管审批"
          subtitle="整单审批放行或退回补充；图片仅用于资料核查，不支持局部放行。"
          meta={<Text type="secondary">当前角色：运营主管</Text>}
          actions={[
            { key: "weekly-plan", label: "安排计划周", onClick: () => router.push("/dashboard/weekly-operations-approval-plans") },
            { key: "dashboard", label: "返回驾驶舱", onClick: () => router.push("/dashboard") },
          ]}
        />
        <FilterCard>
          <Row gutter={[12, 12]}>
            <Col xs={24} md={10}><Input placeholder="搜索法旨编号、店铺、运营需求人、产品编号" prefix={<SearchOutlined />} value={filters.search} onChange={(event) => setFilter({ search: event.target.value })} onPressEnter={search} /></Col>
            <Col xs={12} md={5}><Select value={filters.queueFilter || "ALL"} style={{ width: "100%" }} onChange={(queueFilter) => applyFilters({ ...filters, queueFilter, page: 1 })} options={[
              { value: "ALL", label: "全部" }, { value: "INITIAL", label: "首次提交" }, { value: "RESUBMIT", label: "退回后重提" }, { value: "OVERDUE", label: "超时等待" }, { value: "DATA_ISSUE", label: "资料异常" },
            ]} /></Col>
            <Col xs={12} md={2}><Button type="primary" onClick={search}>筛选</Button></Col>
            <Col xs={12} md={2}><Button onClick={() => applyFilters({ page: 1, pageSize: filters.pageSize || 20, scope: "ops-approvals" })}>重置</Button></Col>
          </Row>
        </FilterCard>
        <DataTableCard title="待审批法旨" extra={<Text type="secondary">待审批法旨 {queueSummary.pendingTaskCount ?? data.total ?? 0} 条 · 待审批图片 {queueSummary.pendingImageCount ?? 0} 张</Text>}>
          {!queueItems.length && !loading ? <SecondaryEmptyState description="暂无待运营主管审批的法旨" /> : <div style={{ overflowX: "auto", marginTop: 14 }}>
            <div style={{ minWidth: 1160, display: "grid", gridTemplateColumns: "150px 130px 120px 120px 100px 135px 120px 110px", gap: 12, padding: "0 4px 8px", borderBottom: "1px solid #f0f0f0", color: "rgba(0,0,0,.45)", fontSize: 12 }}>
              <span>法旨编号</span><span>店铺 / 适配产品</span><span>运营需求人</span><span>产品编号</span><span>有效图片</span><span>提交信息</span><span>等待 / 状态</span><span style={{ textAlign: "right" }}>操作</span>
            </div>
            {queueItems.map((row: any) => <div key={row.id} style={{ minWidth: 1160, display: "grid", gridTemplateColumns: "150px 130px 120px 120px 100px 135px 120px 110px", gap: 12, alignItems: "center", padding: "12px 4px", borderBottom: "1px solid #f0f0f0", minHeight: 66 }}>
              <div><Text strong>{row.serialNumber}</Text><Text type="secondary" style={{ display: "block", fontSize: 12 }}>{row.requirementType?.name || "-"}</Text></div>
              <div><Text>{row.store?.name || "-"}</Text><Text type="secondary" style={{ display: "block", fontSize: 12 }}>{row.compatibleProduct || "-"}</Text></div>
              <span>{row.requester}</span><span>{row.productCode}</span><span>{row.effectiveImageCount} 张</span>
              <div><Tag color={row.submissionType === "RESUBMIT" ? "orange" : "blue"}>{row.submissionType === "RESUBMIT" ? "退回后重提" : "首次提交"}</Tag><Text type="secondary" style={{ display: "block", fontSize: 12 }}>{row.latestSubmittedAt ? new Date(row.latestSubmittedAt).toLocaleString("zh-CN") : "-"}</Text></div>
              <div>{row.isOverdue ? <Tag color="red">等待 {row.waitingHours} 小时</Tag> : <Text>等待 {row.waitingHours} 小时</Text>}{row.dataIssues?.length > 0 && <Text type="danger" style={{ display: "block", fontSize: 12 }}>资料异常 {row.dataIssues.length} 项</Text>}</div>
              <Space style={{ justifyContent: "flex-end" }}><Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(row)}>去审批</Button></Space>
            </div>)}
          </div>}
          <div style={{ marginTop: 16, textAlign: "right" }}><Pagination current={filters.page} pageSize={filters.pageSize} total={data.total} showSizeChanger onChange={(page, pageSize) => applyFilters({ ...filters, page, pageSize })} /></div>
        </DataTableCard>
      </SecondaryPageShell>
    );
  }

  return (
    <SecondaryPageShell>
      <SecondaryPageHeader
        breadcrumb={<span>工作台 / 法旨</span>}
        title={role === "DESIGNER" ? "我的设计任务" : filters.scope === "design-assignment" ? "待分配" : filters.scope === "design-reviews" ? "待审核" : filters.scope === "design-tasks" ? "设计任务" : "法旨中心"}
        subtitle={role === "DESIGNER" ? "查看当前分配给我的设计任务与进度。" : "按当前权限查看法旨处理进度与待办事项。"}
        meta={<Text type="secondary">当前角色：{role ? (roleLabels[role] || role) : "加载中"}</Text>}
        actions={canExport ? [{ key: "export", label: "导出当前筛选", icon: <DownloadOutlined />, onClick: exportCsv }] : []}
        primaryAction={canCreateTask ? { key: "create", label: "新建法旨", icon: <PlusOutlined />, onClick: () => router.push("/dashboard/fazhi/new") } : undefined}
      />

      {!isSupervisorScope && <FilterCard>
        <Segmented
          value={filters.scope || "processing"}
          onChange={(value) => {
            const next = { ...filters, scope: value, status: undefined, page: 1 };
            applyFilters(next);
          }}
          options={[
            { label: `处理中 ${scopeCounts.processing ?? 0}`, value: "processing" },
            ...(canAccessDrafts ? [{ label: `${isAdmin ? "全部草稿" : "我的草稿"} ${scopeCounts.drafts ?? 0}`, value: "drafts" }] : []),
            { label: `已完成归档 ${scopeCounts.archived ?? 0}`, value: "archived" },
          ]}
        />
      </FilterCard>}

      <FilterCard>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10}>
            <Input placeholder="搜索法旨编号、产品编号、兼容产品、需求人" prefix={<SearchOutlined />} value={filters.search}
              onChange={(e) => setFilter({ search: e.target.value })} onPressEnter={search} />
          </Col>
          <Col xs={12} md={5}>
            {role === "DESIGNER" ? (
              <Select
                allowClear
                placeholder="图片任务状态"
                style={{ width: "100%" }}
                value={filters.imageStatus}
                onChange={(value) => applyFilters({ ...filters, imageStatus: value || undefined, taskStatus: value || undefined, page: 1 })}
                options={designerImageStatusOptions}
              />
            ) : (
              <Select allowClear placeholder="状态" style={{ width: "100%" }} value={filters.status}
                onChange={(v) => applyFilters({ ...filters, status: normalizeStatus(v || null), page: 1 })}
                options={statusOptions} />
            )}
          </Col>
          <Col xs={12} md={5}>
            <Select allowClear placeholder="优先级" style={{ width: "100%" }} value={filters.priority}
              onChange={(v) => applyFilters({ ...filters, priority: v, page: 1 })}
              options={[{ value: "URGENT", label: "加急" }, { value: "NORMAL", label: "普通" }]} />
          </Col>
          <Col xs={12} md={2}>
            <Button type="primary" onClick={search}>筛选</Button>
          </Col>
          <Col xs={12} md={2}>
            <Button onClick={resetFilters}>重置</Button>
          </Col>
        </Row>
      </FilterCard>

      <DataTableCard
        title="法旨列表"
        extra={<Text type="secondary">{data.metricUnit === "张" ? `匹配图片任务 ${data.metricTotal ?? 0} 张，涉及法旨 ${data.total ?? 0} 条` : `共 ${data.total ?? 0} 条法旨`}</Text>}
      >
        <div style={{ marginBottom: 12 }}>
        </div>
        {canBatchPriorityRole && (
          <Row justify="space-between" align="middle" style={{ marginBottom: 12, gap: 8 }}>
            <Space wrap>
              <Checkbox checked={allSelected} indeterminate={selectedIds.length > 0 && !allSelected} onChange={(event) => toggleAll(event.target.checked)}>
                选择本页可处理项
              </Checkbox>
              <Text type="secondary">已选 {selectedIds.length} 项</Text>
            </Space>
            <Space wrap>
              <Button size="small" onClick={() => batchPriority("NORMAL")}>批量设为普通</Button>
              <Button size="small" type="primary" danger onClick={() => batchPriority("URGENT")}>批量设为加急</Button>
              {(role === "DESIGN_MANAGER" || isAdmin) && <Tooltip title={batchReason("OPS_APPROVED")}><Button size="small" type="primary" disabled={!batchEligible("OPS_APPROVED")} onClick={() => setAssignment({ taskIds: selectedIds, mode: "ASSIGN" })}>批量分配</Button></Tooltip>}
              {(role === "DESIGN_MANAGER" || isAdmin) && <Tooltip title={batchReason("DESIGN_ASSIGNED")}><Button size="small" disabled={!batchEligible("DESIGN_ASSIGNED")} onClick={() => setAssignment({ taskIds: selectedIds, mode: "REASSIGN" })}>批量改派</Button></Tooltip>}
              {(role === "DESIGN_MANAGER" || isAdmin) && <Tooltip title={batchReason("DESIGN_REVIEW")}><Button size="small" disabled={!batchEligible("DESIGN_REVIEW")} onClick={() => setReview({ taskIds: selectedIds, action: "APPROVE" })}>批量审核通过</Button></Tooltip>}
              {(role === "DESIGN_MANAGER" || isAdmin) && <Tooltip title={batchReason("DESIGN_REVIEW")}><Button size="small" danger disabled={!batchEligible("DESIGN_REVIEW")} onClick={() => setReview({ taskIds: selectedIds, action: "REJECT" })}>批量退回</Button></Tooltip>}
              {(isAdmin || role === "OPERATION") && <Popconfirm title={`确定删除选中的 ${selectedIds.length} 条法旨吗？删除后将不再出现在法旨中心。`} disabled={!selectedIds.length} onConfirm={batchDelete}>
                <Button size="small" danger disabled={!selectedIds.length}>批量删除</Button>
              </Popconfirm>}
            </Space>
          </Row>
        )}

        {!items.length && !loading ? (
          <SecondaryEmptyState description="暂无符合当前筛选条件的法旨" action={canCreateTask ? <Button type="primary" onClick={() => router.push("/dashboard/fazhi/new")}>新建法旨</Button> : undefined} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: (canBatchPriorityRole ? "40px " : "") + (isDraftScope
                  ? "minmax(280px, 1.4fr) minmax(140px, 0.8fr) minmax(150px, 0.9fr) minmax(90px, 0.5fr) minmax(120px, 0.6fr)"
                  : `minmax(280px, 1.4fr) minmax(140px, 0.8fr) minmax(150px, 0.9fr) minmax(90px, 0.5fr)${showAssignedDesigner ? " minmax(120px, 0.7fr)" : ""} minmax(120px, 0.7fr) minmax(120px, 0.6fr)`),
                alignItems: "center",
                gap: 12,
                padding: "0 4px 8px",
                borderBottom: "1px solid #f0f0f0",
                color: "rgba(0,0,0,0.45)",
                fontSize: 12,
              }}
            >
              {canBatchPriorityRole && <span />}
              <span>{"\u6cd5\u65e8\u4fe1\u606f"}</span>
              <span>{"\u9700\u6c42\u4eba"}</span>
              <span>{"\u72b6\u6001"}</span>
              <span>{"\u4f18\u5148\u7ea7"}</span>
              {showAssignedDesigner && <span>当前设计师</span>}
              {!isDraftScope && <span>{"\u5ba1\u6279"}</span>}
              <span style={{ textAlign: "right" }}>{"\u64cd\u4f5c"}</span>
            </div>
            {items.map((row: any) => {
              const selectable = canSetPriority(row);
              const canDelete = canDeleteTask(row);
              const canApprove = canApproveTask(row);
              const approved = isApprovedTask(row);
              const archived = isArchivedScope || ARCHIVE_STATUSES.includes(row.workflowStatus);
              const iconButtonStyle = { width: 30, height: 30, color: "rgba(0,0,0,0.65)" };
              const primaryAction = canAssignDesign(row)
                ? { label: "分配", onClick: () => setAssignment({ taskIds: [row.id], mode: "ASSIGN" }), type: "primary" as const }
                : canReassignDesign(row)
                  ? { label: "改派", onClick: () => setAssignment({ taskIds: [row.id], mode: "REASSIGN" }), type: "default" as const }
                  : canReviewDesign(row)
                    ? { label: "审核", onClick: () => openSingleImageReview(row, "APPROVE"), type: "primary" as const }
                    : { label: isDraftScope ? "继续编辑" : archived ? "查看归档" : "查看详情", onClick: () => openDetail(row), type: "default" as const };
              return (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: (canBatchPriorityRole ? "40px " : "") + (isDraftScope
                      ? "minmax(280px, 1.4fr) minmax(140px, 0.8fr) minmax(150px, 0.9fr) minmax(90px, 0.5fr) minmax(120px, 0.6fr)"
                      : `minmax(280px, 1.4fr) minmax(140px, 0.8fr) minmax(150px, 0.9fr) minmax(90px, 0.5fr)${showAssignedDesigner ? " minmax(120px, 0.7fr)" : ""} minmax(120px, 0.7fr) minmax(120px, 0.6fr)`),
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 4px",
                    borderBottom: "1px solid #f0f0f0",
                    minHeight: 56,
                    background: highlightedId === row.id ? "#fff7d6" : undefined,
                    boxShadow: highlightedId === row.id ? "inset 3px 0 0 #d89614" : undefined,
                    transition: "background 240ms ease, box-shadow 240ms ease",
                  }}
                >
                  {canBatchPriorityRole && (
                    <Checkbox disabled={!selectable} checked={selectedIds.includes(row.id)} onChange={(event) => toggleRow(row, event.target.checked)} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <Tooltip title={row.productCode || "-"}>
                      <Text
                        strong
                        style={{
                          display: "block",
                          fontSize: 17,
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.productCode || "-"}
                      </Text>
                    </Tooltip>
                    <Text type="secondary" style={{ display: "block", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.serialNumber}</Text>
                  </div>
                  <Text style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayRequester(row)}</Text>
                  <SecondaryStatusTag status={row.workflowStatus} label={isDraftScope ? "未提交" : (statusLabels[row.workflowStatus] || row.workflowStatus)} />
                  <Tag color={row.priority === "URGENT" ? "red" : "default"} style={{ width: "fit-content", marginInlineEnd: 0 }}>{row.priority === "URGENT" ? "\u52a0\u6025" : "\u666e\u901a"}</Tag>
                  {showAssignedDesigner && <Text style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayUserName((row.imageTasks || []).find((item: any) => item.designer)?.designer, "未分配")}</Text>}
                  {!isDraftScope && (!archived && canApprove ? (
                    <Popconfirm title="确定通过该法旨审批吗？" onConfirm={() => approveTask(row)}>
                      <Button size="small" shape="round" type="primary" style={{ width: 78 }}>{"\u672a\u5ba1\u6279"}</Button>
                    </Popconfirm>
                  ) : !archived && approved ? (
                    canRollbackApproval(row) ? (
                      <Popconfirm title="确定回退该法旨审批吗？" onConfirm={() => rollbackApproval(row)}>
                        <Button size="small" shape="round" style={{ width: 78 }}>{"\u5df2\u5ba1\u6279"}</Button>
                      </Popconfirm>
                    ) : (
                      <Tooltip title="当前法旨已进入后续流程，不能在列表中回退审批，请进入详情页处理。">
                        <Button size="small" shape="round" disabled style={{ width: 78 }}>{"\u5df2\u5ba1\u6279"}</Button>
                      </Tooltip>
                    )
                  ) : <Text type="secondary">-</Text>)}
                  <Space size={4} style={{ justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                    <Button size="small" type={primaryAction.type} onClick={primaryAction.onClick}>{primaryAction.label}</Button>
                    <Dropdown
                      trigger={["click"]}
                      menu={{
                        items: [
                          ...(canReviewDesign(row) ? [{ key: "reject", label: "退回修改", danger: true }] : []),
                          ...(canDelete ? [{ key: "delete", label: "删除法旨", danger: true }] : []),
                          { key: "view", label: isDraftScope ? "继续编辑" : archived ? "\u67e5\u770b\u5f52\u6863" : "\u67e5\u770b\u8be6\u60c5" },
                        ],
                        onClick: ({ key }) => {
                          if (key === "reject") openSingleImageReview(row, "REJECT");
                          if (key === "delete") {
                            Modal.confirm({ title: "确认删除该法旨？", content: "删除后不可恢复。", okButtonProps: { danger: true }, onOk: () => deleteTask(row) });
                          }
                          if (key === "view") openDetail(row);
                        },
                      }}
                    >
                      <Button size="small" type="text" icon={<MoreOutlined style={{ fontSize: 16 }} />} style={iconButtonStyle} />
                    </Dropdown>
                  </Space>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 16, textAlign: "right" }}>
          <Pagination
            current={filters.page}
            pageSize={filters.pageSize}
            total={data.total}
            showSizeChanger
            showTotal={(total) => `共 ${total} 条`}
            onChange={(page, pageSize) => {
              const next = { ...filters, page, pageSize };
              applyFilters(next);
            }}
          />
        </div>
      </DataTableCard>
      <TaskAssignmentModal open={!!assignment} taskIds={assignment?.taskIds || []} tasks={data.items || []} designers={designers} mode={assignment?.mode} onClose={() => setAssignment(null)} onSuccess={() => loadData(filters)} />
      <Modal title={review?.action === "REJECT" ? "退回修改" : "审核通过"} open={!!review} onCancel={() => { setReview(null); setReviewRemark(""); }} onOk={submitReview} okText="确认">
        {review?.action === "REJECT" ? <Input.TextArea value={reviewRemark} onChange={(event) => setReviewRemark(event.target.value)} rows={4} placeholder="请填写退回原因（必填）" /> : <Input.TextArea value={reviewRemark} onChange={(event) => setReviewRemark(event.target.value)} rows={3} placeholder="审核备注（可选）" />}
      </Modal>
    </SecondaryPageShell>
  );
}
