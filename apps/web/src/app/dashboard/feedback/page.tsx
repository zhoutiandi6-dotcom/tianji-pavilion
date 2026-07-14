'use client';
import { useState, useEffect } from "react";
import { Card, Table, Tag, Typography, Select, message } from "antd";
import api from "@/lib/api";
const { Title } = Typography;
const severityColors: Record<string, string> = { critical: "red", major: "orange", normal: "blue", minor: "green", suggestion: "purple" };
const severityLabels: Record<string, string> = { critical: "严重", major: "主要", normal: "一般", minor: "轻微", suggestion: "建议" };

export default function FeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/feedback");
      const d = r.data.data || r.data;
      setData(d.items || []);
      setTotal(d.total || 0);
    } catch { message.error("load fail"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: number, status: string) => {
    try { await api.patch("/feedback/" + id + "/status", { status }); message.success("ok"); load(); }
    catch { message.error("fail"); }
  };

  const columns = [
    { title: "Time", dataIndex: "createdAt", key: "createdAt", width: 140, render: (v: string) => new Date(v).toLocaleString("zh-CN") },
    { title: "Role", dataIndex: "role", key: "role", width: 60 },
    { title: "Module", dataIndex: "module", key: "module", width: 70 },
    { title: "Severity", dataIndex: "severity", key: "severity", width: 70, render: (v: string) => <Tag color={severityColors[v]}>{severityLabels[v] || v}</Tag> },
    { title: "Description", dataIndex: "description", key: "description", ellipsis: true },
    { title: "Suggestion", dataIndex: "suggestion", key: "suggestion", ellipsis: true, render: (v: string) => v || "-" },
    { title: "Status", dataIndex: "status", key: "status", width: 120, render: (v: string, r: any) => (
      <Select value={v} size="small" style={{ width: 100 }}
        onChange={(val) => updateStatus(r.id, val)}
        options={[{ value: "open", label: "open" }, { value: "in_progress", label: "in progress" }, { value: "resolved", label: "resolved" }, { value: "closed", label: "closed" }]} />
    )},
  ];

  return (
    <div>
      <Title level={4}>Feedback Management</Title>
      <Card><Table dataSource={data} columns={columns} rowKey="id" loading={loading}
        pagination={{ total, pageSize: 50, showTotal: (t) => "total " + t }}
        scroll={{ x: 800 }} size="small" /></Card>
    </div>
  );
}
