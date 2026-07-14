'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Col, Empty, Input, List, Progress, Row, Space, Statistic, Tag, Typography } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, FileTextOutlined, SearchOutlined, ThunderboltOutlined } from "@ant-design/icons";
import api from "@/lib/api";
import Loading from "@/components/Loading";
import { displayRequester, displayUserName } from "@/lib/display";

const { Title, Text } = Typography;

const taskStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待运营主管审批",
  OPS_REJECTED: "运营主管退回",
  OPS_APPROVED: "已通过待设计分配",
  DESIGN_ASSIGNED: "已分配设计",
  IN_DESIGN: "设计中",
  DESIGN_REVIEW: "待设计审核",
  DESIGN_REJECTED: "设计退回修改",
  DESIGN_APPROVED: "设计审核通过",
  TECH_REVIEW: "待技术审核",
  TECH_APPROVED: "技术审核通过",
  INVENTORY_PENDING: "待上传进销存",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const imageStatusLabels: Record<string, string> = {
  WAITING_OPS_APPROVAL: "等待运营主管审批",
  PENDING_ASSIGNMENT: "待分配",
  NOT_STARTED: "未开始",
  IN_PROGRESS: "设计中",
  SUBMITTED_FOR_REVIEW: "待设计审核",
  REVISION_REQUIRED: "退回修改",
  APPROVED: "已通过",
  COMPLETED: "已完成",
};

const statusColor: Record<string, string> = {
  DRAFT: "default",
  SUBMITTED: "warning",
  OPS_REJECTED: "error",
  OPS_APPROVED: "processing",
  DESIGN_ASSIGNED: "blue",
  IN_DESIGN: "purple",
  DESIGN_REVIEW: "gold",
  DESIGN_APPROVED: "success",
  NOT_STARTED: "blue",
  IN_PROGRESS: "purple",
  SUBMITTED_FOR_REVIEW: "gold",
  REVISION_REQUIRED: "error",
  APPROVED: "success",
};

function statusText(status: string) {
  return taskStatusLabels[status] || imageStatusLabels[status] || status;
}

function statusUrl(status?: string) {
  return status ? `/dashboard/fazhi?status=${encodeURIComponent(status)}` : "/dashboard/fazhi";
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});
  const [user, setUser] = useState<any>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    Promise.all([api.get("/auth/me"), api.get("/dashboard/overview")])
      .then(([me, ov]) => {
        setUser(me.data.data || me.data);
        setData(ov.data.data || ov.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const cards = data.cards || [];
  const todoItems = data.todoItems || [];
  const flowCounts = data.flowCounts || [];
  const recentTasks = data.recentTasks || [];
  const totalFlow = flowCounts.reduce((sum: number, item: any) => sum + Number(item.count || 0), 0);
  const doneFlow = flowCounts.find((item: any) => item.status === "DESIGN_APPROVED")?.count || 0;
  const progress = totalFlow ? Math.round((Number(doneFlow) / totalFlow) * 100) : 0;

  const search = () => {
    router.push(q.trim() ? `/dashboard/fazhi?search=${encodeURIComponent(q.trim())}` : "/dashboard/fazhi");
  };

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 18, boxShadow: "0 18px 45px rgba(20,20,20,0.06)" }}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} lg={12}>
            <Text type="secondary">{displayUserName(user)} · {data.title}</Text>
            <Title style={{ margin: "10px 0 8px", fontSize: 36, lineHeight: 1.1, letterSpacing: 0 }}>{data.title || "角色工作台"}</Title>
            <Text type="secondary">{data.subtitle}</Text>
            <Space.Compact style={{ width: "100%", maxWidth: 560, marginTop: 18 }}>
              <Input size="large" prefix={<SearchOutlined />} placeholder="搜索法旨编号、产品编号、店铺、需求人" value={q} onChange={(e) => setQ(e.target.value)} onPressEnter={search} />
              <Button size="large" type="primary" onClick={search}>搜索</Button>
            </Space.Compact>
            <Space style={{ marginTop: 16 }} wrap>
              {(data.quickActions || []).map((item: any) => (
                <Button key={item.href + item.label} type={item.href.includes("new") ? "primary" : "default"} onClick={() => router.push(item.href)}>
                  {item.label}
                </Button>
              ))}
            </Space>
          </Col>
          <Col xs={24} lg={6}>
            <div style={{ height: 210, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Progress type="dashboard" percent={progress} strokeColor="#ff6b4a" trailColor="#f0f0f0" size={180} format={() => `${doneFlow}/${totalFlow}`} />
            </div>
            <Text type="secondary" style={{ display: "block", textAlign: "center" }}>设计审核通过 / 可见流转总数</Text>
          </Col>
          <Col xs={24} lg={6}>
            <Card size="small" bordered={false} style={{ background: "#f7f7f7", borderRadius: 8 }}>
              <Statistic title="待办事项" value={todoItems.length} prefix={<ThunderboltOutlined />} />
            </Card>
            <Card size="small" bordered={false} style={{ background: "#f7f7f7", borderRadius: 8, marginTop: 12 }}>
              <Statistic title="可见最近法旨" value={recentTasks.length} prefix={<FileTextOutlined />} />
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[14, 14]}>
        {cards.map((card: any, idx: number) => (
          <Col xs={24} sm={12} lg={8} xl={4} key={card.title}>
            <Card
              bordered={false}
              hoverable
              style={{ borderRadius: 8, boxShadow: "0 10px 28px rgba(20,20,20,0.05)", cursor: "pointer" }}
              onClick={() => router.push(card.target || "/dashboard/fazhi")}
            >
              <Statistic
                title={card.title}
                value={card.value}
                prefix={idx % 2 ? <ClockCircleOutlined /> : <CheckCircleOutlined />}
                valueStyle={{ color: idx % 3 === 0 ? "#111" : idx % 3 === 1 ? "#d46b08" : "#1677ff" }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="法旨流转状态" bordered={false} style={{ borderRadius: 8, marginTop: 18, boxShadow: "0 10px 28px rgba(20,20,20,0.05)" }}>
        {flowCounts.length ? (
          <Row gutter={[10, 10]}>
            {flowCounts.map((item: any, idx: number) => (
              <Col xs={12} md={6} lg={Math.max(3, Math.floor(24 / Math.max(flowCounts.length, 1))) as any} key={item.status}>
                <div
                  onClick={() => router.push(statusUrl(item.status))}
                  style={{ padding: "14px 12px", borderRadius: 8, background: idx <= 2 ? "#fff7f4" : "#f7f7f7", minHeight: 78, cursor: "pointer" }}
                >
                  <Text strong>{statusText(item.status)}</Text>
                  <Text type="secondary" style={{ display: "block", marginTop: 8 }}>{item.count} 条</Text>
                </div>
              </Col>
            ))}
          </Row>
        ) : <Empty description="暂无流转数据，完成新建法旨后这里会显示状态分布" />}
      </Card>

      <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
        <Col xs={24} lg={14}>
          <Card title="重点待办" bordered={false} style={{ borderRadius: 8, boxShadow: "0 10px 28px rgba(20,20,20,0.05)" }}>
            {todoItems.length ? (
              <List
                dataSource={todoItems}
                renderItem={(item: any) => (
                  <List.Item actions={[<Button key="open" size="small" onClick={() => router.push("/dashboard/fazhi/" + item.taskId)}>进入</Button>]}>
                    <List.Item.Meta
                      title={<Space><Text strong>{item.title}</Text><Tag color={statusColor[item.status]}>{statusText(item.status)}</Tag></Space>}
                      description={item.description}
                    />
                  </List.Item>
                )}
              />
            ) : <Empty description="当前无需处理事项" />}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="最近法旨" bordered={false} style={{ borderRadius: 8, boxShadow: "0 10px 28px rgba(20,20,20,0.05)" }}>
            {recentTasks.length ? (
              <List
                dataSource={recentTasks}
                renderItem={(item: any) => (
                  <List.Item onClick={() => router.push("/dashboard/fazhi/" + item.id)} style={{ cursor: "pointer" }}>
                    <List.Item.Meta
                      title={<Space><Text strong>{item.serialNumber}</Text><Tag color={statusColor[item.workflowStatus]}>{statusText(item.workflowStatus)}</Tag>{item.priority === "URGENT" && <Tag color="red">加急</Tag>}</Space>}
                      description={`${item.store?.name || "未选店铺"} · ${item.productCode || "未填产品编号"} · ${displayRequester(item)}`}
                    />
                  </List.Item>
                )}
              />
            ) : <Empty description="暂无最近法旨，可从法旨中心查看或新建法旨" />}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
