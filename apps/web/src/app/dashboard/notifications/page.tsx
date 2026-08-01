'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, List, Typography, message, Space } from "antd";
import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import api from "@/lib/api";
import {
  DataTableCard,
  SecondaryEmptyState,
  SecondaryErrorState,
  SecondaryPageHeader,
  SecondaryPageShell,
  SecondaryStatusTag,
} from "@/components/secondary-page";
import { formatShanghaiDateTime } from "@/lib/shanghai-week";

const { Text } = Typography;

const typeColors: Record<string, string> = {
  info: "blue", warning: "orange", success: "green", task_assigned: "purple",
};

const typeLabels: Record<string, string> = {
  info: "系统通知",
  warning: "提醒",
  success: "处理结果",
  task_assigned: "任务分配",
  workflow: "流程通知",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/notifications?page=${page}&pageSize=20`);
      const d = r.data.data || r.data;
      setData(d.items || []);
      setTotal(d.total || 0);
      setError(null);
    } catch {
      setError("通知数据暂时无法加载，请稍后重试。");
      message.error("加载失败");
    }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  const markRead = async (id: number) => {
    try { await api.patch(`/notifications/${id}/read`); await load(); }
    catch { message.error("操作失败"); }
  };

  const markAllRead = async () => {
    try { await api.post("/notifications/read-all"); message.success("全部已读"); await load(); }
    catch { message.error("操作失败"); }
  };

  const openNotification = async (item: any) => {
    if (!item.isRead) await markRead(item.id);
    if (item.taskId) router.push(`/dashboard/fazhi/${item.taskId}`);
  };

  const relationText = (item: any) => {
    if (item.taskId) return `关联法旨 #${item.taskId}`;
    if (item.imageTaskId) return `关联图片任务 #${item.imageTaskId}`;
    return "无关联业务对象";
  };

  return (
    <SecondaryPageShell>
      <SecondaryPageHeader
        title="通知中心"
        subtitle="查看与当前账号权限范围一致的业务通知"
        primaryAction={{
          key: "read-all",
          label: "全部标记已读",
          icon: <CheckOutlined />,
          onClick: () => void markAllRead(),
          disabled: !data.some((item) => !item.isRead),
        }}
      />
      {error && data.length === 0 ? <SecondaryErrorState message={error} action={<Button onClick={() => void load()}>重新加载</Button>} /> : (
      <DataTableCard title={`全部通知 ${total ? `(${total})` : ""}`} extra={error ? <Button size="small" onClick={() => void load()}>重新加载</Button> : null}>
        <List
          dataSource={data}
          loading={loading}
          locale={{ emptyText: <SecondaryEmptyState description="暂无通知" /> }}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: (p) => setPage(p),
            size: "small",
          }}
          renderItem={(item: any) => (
            <List.Item
              onClick={() => openNotification(item)}
              actions={[
                !item.isRead && (
                  <Button size="small" onClick={(event) => { event.stopPropagation(); void markRead(item.id); }}>
                    标记已读
                  </Button>
                ),
                item.taskId && (
                  <Button size="small" type="link" onClick={(event) => { event.stopPropagation(); void openNotification(item); }}>
                    查看
                  </Button>
                ),
              ].filter(Boolean)}
              style={{ background: item.isRead ? "transparent" : "#f5f8ff", padding: "14px 16px", marginBottom: 2, borderBottom: "1px solid #efefed", cursor: item.taskId ? "pointer" : "default" }}
            >
              <List.Item.Meta
                avatar={<BellOutlined style={{ fontSize: 20, color: typeColors[item.type] || "#999" }} />}
                title={
                  <Space wrap>
                    <Text strong={!item.isRead}>{item.title}</Text>
                    <SecondaryStatusTag status={item.isRead ? "READ" : "UNREAD"} />
                    <Text type="secondary" style={{ fontSize: 12 }}>{typeLabels[item.type] || "通知"}</Text>
                  </Space>
                }
                description={
                  <div>
                    <Text type="secondary">{item.content}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{formatShanghaiDateTime(item.createdAt) || "-"} · {relationText(item)}</Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </DataTableCard>
      )}
    </SecondaryPageShell>
  );
}

