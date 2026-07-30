'use client';

import { useEffect, useMemo, useState } from "react";
import { Descriptions, Input, Modal, Select, Space, Tag, Typography, message } from "antd";
import api, { getErrorMessage, imageTaskApi } from "@/lib/api";
import { displayUserName } from "@/lib/display";
import { formatShanghaiWeek, getShanghaiWeekStart, shiftShanghaiWeekStart } from "@/lib/shanghai-week";

const { Text } = Typography;

export default function TaskAssignmentModal({
  open,
  taskIds,
  tasks,
  designers,
  mode = "ASSIGN",
  planMode = false,
  onClose,
  onSuccess,
}: {
  open: boolean;
  taskIds: number[];
  tasks: any[];
  designers: any[];
  mode?: "ASSIGN" | "REASSIGN";
  planMode?: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const currentWeek = useMemo(() => getShanghaiWeekStart() || '', []);
  const nextWeek = useMemo(() => shiftShanghaiWeekStart(currentWeek, 1) || currentWeek, [currentWeek]);
  const [designerId, setDesignerId] = useState<number>();
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [submitting, setSubmitting] = useState(false);
  const [currentLoad, setCurrentLoad] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const selectedTasks = tasks.filter((item) => taskIds.includes(item.id));
  const imageCount = selectedTasks.reduce((sum, item) => sum + Number(item.imageCount || item.imageTasks?.filter((image: any) => !image.deletedAt).length || 0), 0);

  useEffect(() => {
    if (!open) return;
    setDesignerId(undefined);
    setSelectedWeek(currentWeek);
    setCurrentLoad(null);
    setReason("");
  }, [open, currentWeek]);

  useEffect(() => {
    if (!open || !designerId) return;
    api.get("/weekly-designer-plans", { params: { weekStart: selectedWeek } }).then((response) => {
      const data = response.data.data || response.data;
      const row = (data.designers || []).find((item: any) => item.designerId === designerId);
      setCurrentLoad(Number(row?.plannedImageCount || 0));
    }).catch(() => setCurrentLoad(null));
  }, [open, designerId, selectedWeek]);

  const submit = async () => {
    if (!designerId) return message.warning("请选择目标设计师");
    setSubmitting(true);
    try {
      if (mode === "REASSIGN" && !reason.trim()) return message.warning("请填写调整原因");
      await imageTaskApi.batchAssignTasks({ taskIds, designerId, mode, weekStart: selectedWeek, reason: reason.trim() || undefined });
      message.success(mode === "ASSIGN" ? "法旨已分配并纳入周计划" : "法旨已改派并同步周计划");
      onClose();
      await onSuccess();
    } catch (error) {
      message.error(getErrorMessage(error, "分配法旨失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return <Modal title={mode === "REASSIGN" ? "调整法旨分配" : planMode ? "添加法旨到本周计划" : "分配法旨"} open={open} onCancel={onClose} onOk={submit} okText={mode === "REASSIGN" ? "确认调整" : "确认分配"} confirmLoading={submitting} destroyOnClose>
    <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
      <Descriptions.Item label="已选择法旨">{taskIds.length} 道</Descriptions.Item>
      <Descriptions.Item label="有效图片">{imageCount} 张</Descriptions.Item>
      <Descriptions.Item label="当前状态"><Tag color={mode === "ASSIGN" ? "blue" : "orange"}>{mode === "ASSIGN" ? "待分配" : "已分配待开始"}</Tag></Descriptions.Item>
    </Descriptions>
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <div><Text strong>目标设计师</Text><Select value={designerId} onChange={setDesignerId} placeholder="选择设计师" style={{ width: "100%", marginTop: 6 }} options={designers.map((user) => ({ value: user.userId ?? user.id, label: `${user.name || displayUserName(user)}（${user.username}）` }))} /></div>
      <div><Text strong>计划周次</Text><Select value={selectedWeek} onChange={setSelectedWeek} style={{ width: "100%", marginTop: 6 }} options={[{ value: currentWeek, label: `当前周：${formatShanghaiWeek(currentWeek) || '周数据暂时无法加载'}` }, { value: nextWeek, label: `下一周：${formatShanghaiWeek(nextWeek) || '周数据暂时无法加载'}` }]} /></div>
      {mode === "REASSIGN" && <div><Text strong>调整原因</Text><Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={3} placeholder="请说明改派或调整周次的原因" style={{ marginTop: 6 }} /></div>}
      {designerId && <Text type="secondary">分配后，该设计师本周有效图片 {currentLoad ?? 0} 张 → {(currentLoad ?? 0) + imageCount} 张。{selectedWeek === currentWeek ? "当前周尚无计划时将自动建立草稿计划。" : "将建立或加入下一周草稿计划。"}</Text>}
    </Space>
  </Modal>;
}
