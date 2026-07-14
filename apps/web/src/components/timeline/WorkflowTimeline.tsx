'use client';

import { Spin, Empty, Typography, Tag } from "antd";
import {
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  FileAddOutlined, SendOutlined, RollbackOutlined,
  PlayCircleOutlined, EyeOutlined, UserOutlined,
} from "@ant-design/icons";
import api from "@/lib/api";
import { useState, useEffect } from "react";

const { Text } = Typography;

const EVENT_ICONS: any = {
  WorkflowCreated: <FileAddOutlined style={{ color: "#1890ff" }} />,
  WorkflowSubmitted: <SendOutlined style={{ color: "#fa8c16" }} />,
  WorkflowWithdrawn: <RollbackOutlined style={{ color: "#722ed1" }} />,
  WorkflowApproved: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
  WorkflowRejected: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
  WorkflowCompleted: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
  ImageTaskCreated: <FileAddOutlined style={{ color: "#1890ff" }} />,
  "image_task.started": <PlayCircleOutlined style={{ color: "#1890ff" }} />,
  "image_task.submitted_for_review": <EyeOutlined style={{ color: "#fa8c16" }} />,
  "image_task.review_approved": <CheckCircleOutlined style={{ color: "#52c41a" }} />,
  "image_task.review_rejected": <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
  "image_task.assigned": <UserOutlined style={{ color: "#722ed1" }} />,
};

const EVENT_COLORS: any = {
  WorkflowCreated: "blue",
  WorkflowSubmitted: "orange",
  WorkflowWithdrawn: "purple",
  WorkflowApproved: "green",
  WorkflowRejected: "red",
  WorkflowCompleted: "green",
};

export default function WorkflowTimeline({ taskId }: { taskId: number }) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/timeline/task/" + taskId).then((r) => {
      const d = r.data.data || r.data;
      setEvents(Array.isArray(d) ? d : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <Spin style={{ display: "block", margin: 24 }} />;
  if (events.length === 0) return <Empty description="暂无事件记录" />;

  return (
    <div style={{ position: "relative", paddingLeft: 32 }}>
      <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 2, background: "#e8e8e8" }} />
      {events.map((evt: any, idx: number) => {
        const evtIcon = EVENT_ICONS[evt.event];
        const color = EVENT_COLORS[evt.event] || "default";
        const time = new Date(evt.time).toLocaleString("zh-CN", {
          month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
        });
        return (
          <div key={evt.id || idx} style={{ position: "relative", marginBottom: 16, paddingLeft: 16 }}>
            <div style={{
              position: "absolute", left: -25, top: 4, width: 12, height: 12,
              borderRadius: "50%", background: "#fff", border: "2px solid #d9d9d9",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
            }}>
              {evtIcon || <ClockCircleOutlined style={{ fontSize: 10 }} />}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <Text strong style={{ fontSize: 13 }}>{evt.label}</Text>
                <Tag color={color} style={{ fontSize: 11, lineHeight: "18px", padding: "0 6px" }}>{evt.event}</Tag>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#999" }}>
                <span>{time}</span>
                <span>{evt.operator}</span>
              </div>
              {evt.metadata?.comment && (
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 2 }}>
                  备注: {evt.metadata.comment}
                </Text>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
