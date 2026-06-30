'use client';

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Card, Tag, Button, Space, Typography, message, Modal, Select, Spin, Divider, Row, Col, Descriptions, Switch
} from "antd";
import { ArrowLeftOutlined, DeleteOutlined, ExclamationCircleOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { taskApi } from "@/lib/api";
import api from "@/lib/api";

const { Title, Text } = Typography;

const statusColors: Record<string, string> = {
  PENDING: "default", IN_PROGRESS: "processing",
  COMPLETED: "success", CANCELLED: "error",
};
const statusLabels: Record<string, string> = {
  PENDING: "待处理", IN_PROGRESS: "进行中",
  COMPLETED: "已完成", CANCELLED: "已取消",
};

export default function FazhiDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const parseDescription = (desc: string) => {
    if (!desc) return {};
    const parts: Record<string, string> = {};
    const sections = desc.split("\n---\n");
    sections.forEach((s: string) => {
      if (s.startsWith("图片尺寸：")) parts.imageSize = s.replace("图片尺寸：", "");
      else if (s.startsWith("使用位置：")) parts.usageLocation = s.replace("使用位置：", "");
      else if (s.startsWith("参考链接：")) parts.referenceLink = s.replace("参考链接：", "");
      else if (s.startsWith("原图链接：")) parts.originalLink = s.replace("原图链接：", "");
      else if (s.startsWith("需求类型：")) parts.requirementType = s.replace("需求类型：", "");
      else if (s.startsWith("修改需求：")) parts.requirements = s.replace("修改需求：\n", "");
    });
    return parts;
  };

  const loadTask = async () => {
    setLoading(true);
    try {
      const res = await taskApi.findOne(id);
      setTask(res.data.data || res.data);
    } catch { message.error("加载失败"); router.push("/dashboard/fazhi"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    api.get("/auth/me").then((r) => {
      const data = r.data.data || r.data;
      setCurrentUser(data);
    }).catch(() => router.push("/login"));
    loadTask();
  }, [id]);

  const handleStatusChange = async (status: string) => {
    try { await taskApi.updateStatus(id, status); message.success("状态已更新"); loadTask(); }
    catch { message.error("操作失败"); }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: "确认删除此法旨?",
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        try { await taskApi.remove(id); message.success("已删除"); router.push("/dashboard/fazhi"); }
        catch { message.error("删除失败"); }
      },
    });
  };

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!task) return null;

  const parsed = parseDescription(task.description || "");
  const reqLines = parsed.requirements ? parsed.requirements.split("\n").filter(Boolean) : [];
  const canEdit = currentUser?.role !== "DESIGNER" || task.assigneeId === currentUser?.id;
  const canDelete = currentUser?.role === "ADMIN" || task.creatorId === currentUser?.id;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/dashboard/fazhi")}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>法旨详情</Title>
      </Space>

      {/* 头部状态栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col flex="auto">
            <Space>
              {task.isUrgent && <Tag icon={<ThunderboltOutlined />} color="red">紧急</Tag>}
              <Title level={3} style={{ margin: 0 }}>{task.title}</Title>
            </Space>
            <div style={{ marginTop: 8 }}>
              <Space>
                <Tag color={statusColors[task.status]}>{statusLabels[task.status]}</Tag>
                {task.productCode && <Tag color="blue">产品: {task.productCode}</Tag>}
                {task.store && <Tag>{task.store.name}</Tag>}
              </Space>
            </div>
          </Col>
          <Col>
            <Space>
              {canEdit && (
                <Select value={task.status} style={{ width: 110 }}
                  onChange={handleStatusChange}
                  options={Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v }))} />
              )}
              {canDelete && (
                <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>删除</Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 一、基础信息 */}
      <Card title="一、基础信息" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="产品编号">{task.productCode || "-"}</Descriptions.Item>
          <Descriptions.Item label="紧急需求">{task.isUrgent ? <Tag color="red">是</Tag> : "否"}</Descriptions.Item>
          <Descriptions.Item label="图片尺寸">{parsed.imageSize || "-"}</Descriptions.Item>
          <Descriptions.Item label="使用位置">{parsed.usageLocation || "-"}</Descriptions.Item>
          <Descriptions.Item label="店铺">{task.store?.name || "-"}</Descriptions.Item>
          <Descriptions.Item label="优先级">
            {["低", "中", "高", "紧急"][["LOW", "MEDIUM", "HIGH", "URGENT"].indexOf(task.priority)] || task.priority}
          </Descriptions.Item>
          <Descriptions.Item label="创建人">{task.creator?.displayName || "-"}</Descriptions.Item>
          <Descriptions.Item label="负责人">{task.assignee?.displayName || "未指定"}</Descriptions.Item>
          <Descriptions.Item label="创建时间" span={2}>{new Date(task.createdAt).toLocaleString("zh-CN")}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 二、需求类型 */}
      {parsed.requirementType && (
        <Card title="二、需求类型" style={{ marginBottom: 16 }}>
          <Text>{parsed.requirementType}</Text>
        </Card>
      )}

      {/* 三、素材上传 */}
      {(parsed.referenceLink || parsed.originalLink) && (
        <Card title="三、素材上传" style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small">
            {parsed.referenceLink && <Descriptions.Item label="参考链接"><Text copyable>{parsed.referenceLink}</Text></Descriptions.Item>}
            {parsed.originalLink && <Descriptions.Item label="原图链接"><Text copyable>{parsed.originalLink}</Text></Descriptions.Item>}
          </Descriptions>
        </Card>
      )}

      {/* 四、修改需求 */}
      {reqLines.length > 0 && (
        <Card title="四、修改需求" style={{ marginBottom: 16 }}>
          {reqLines.map((line: string, i: number) => (
            <div key={i} style={{ padding: "4px 0" }}>
              <Text>{line}</Text>
            </div>
          ))}
        </Card>
      )}

      {/* 附件计数 */}
      {task._count?.attachments > 0 && (
        <Card title="附件" style={{ marginBottom: 16 }}>
          <Text>{task._count.attachments} 个文件</Text>
        </Card>
      )}
    </div>
  );
}
