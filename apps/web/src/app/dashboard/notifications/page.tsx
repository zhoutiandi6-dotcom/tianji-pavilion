'use client';

import { useState, useEffect } from "react";
import { Card, List, Button, Typography, message, Tag, Empty, Spin, Space } from "antd";
import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import api from "@/lib/api";

const { Title, Text } = Typography;

const typeColors: Record<string, string> = {
  info: "blue", warning: "orange", success: "green", task_assigned: "purple",
};

export default function NotificationsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/notifications?page=${page}&pageSize=20`);
      const d = r.data.data || r.data;
      setData(d.items || []);
      setTotal(d.total || 0);
    } catch { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  const markRead = async (id: number) => {
    try { await api.patch(`/notifications/${id}/read`); load(); }
    catch { message.error("操作失败"); }
  };

  const markAllRead = async () => {
    try { await api.post("/notifications/read-all"); message.success("全部已读"); load(); }
    catch { message.error("操作失败"); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>通知中心</Title>
        <Button icon={<CheckOutlined />} onClick={markAllRead}>全部已读</Button>
      </div>
      <Card>
        <List
          dataSource={data}
          loading={loading}
          locale={{ emptyText: <Empty description="暂无通知" /> }}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: (p) => setPage(p),
            size: "small",
          }}
          renderItem={(item: any) => (
            <List.Item
              actions={[
                !item.isRead && (
                  <Button size="small" type="link" onClick={() => markRead(item.id)}>
                    标记已读
                  </Button>
                ),
              ].filter(Boolean)}
              style={{ background: item.isRead ? "transparent" : "#f0f5ff", padding: "12px 16px", marginBottom: 4, borderRadius: 4 }}
            >
              <List.Item.Meta
                avatar={<BellOutlined style={{ fontSize: 20, color: typeColors[item.type] || "#999" }} />}
                title={
                  <Space>
                    <Text strong={!item.isRead}>{item.title}</Text>
                    <Tag color={item.isRead ? "default" : "blue"}>{item.isRead ? "已读" : "未读"}</Tag>
                  </Space>
                }
                description={
                  <div>
                    <Text type="secondary">{item.content}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{new Date(item.createdAt).toLocaleString("zh-CN")}</Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
