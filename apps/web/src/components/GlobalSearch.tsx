'use client';

import { useRef, useState } from "react";
import { Card, Input, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

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

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const timer = useRef<any>(null);

  const search = (val: string) => {
    setQ(val);
    if (timer.current) clearTimeout(timer.current);
    if (!val.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const { default: api } = await import("@/lib/api");
        const r = await api.get("/tasks", { params: { search: val, pageSize: 5 } });
        const d = r.data.data || r.data;
        setResults(d.items || []);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
  };

  return (
    <div style={{ position: "relative" }}>
      <Input
        placeholder="搜索法旨编号、产品编号、店铺、需求人"
        prefix={<SearchOutlined />}
        style={{ width: 260 }}
        value={q}
        onChange={(e) => search(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && results.length > 0 && (
        <Card size="small" style={{ position: "absolute", top: 40, left: 0, width: 420, zIndex: 1000, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {results.map((r: any) => (
            <div key={r.id} style={{ padding: "6px 0", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
              onMouseDown={() => { router.push("/dashboard/fazhi/" + r.id); setOpen(false); }}>
              <Text strong style={{ marginRight: 8 }}>{r.serialNumber}</Text>
              {r.productCode && <Tag>{r.productCode}</Tag>}
              <Tag color={r.priority === "URGENT" ? "red" : "default"}>{statusLabels[r.workflowStatus] || r.workflowStatus}</Tag>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
