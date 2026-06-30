'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card, Form, Input, Select, Button, Typography, message, Space, Row, Col, Switch, Divider, Tag,
} from "antd";
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { taskApi } from "@/lib/api";
import api from "@/lib/api";

const { Title, Text } = Typography;
const { TextArea } = Input;

const typeDescriptions = [
  { value: 1, label: "仅替换文案", desc: "只改文字，产品/背景/角度不变" },
  { value: 2, label: "附图套版", desc: "模板不变、只换同角度产品" },
  { value: 3, label: "场景修改", desc: "换角度、换背景、换线材造型、调色" },
  { value: 4, label: "个性化定制", desc: "全新做图、无模板、创意设计" },
];

// Colors for the type cards
const typeColors = ["#1677ff", "#52c41a", "#fa8c16", "#722ed1"];

export default function NewFazhiPage() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [reqItems, setReqItems] = useState<string[]>([""]);

  useEffect(() => {
    const init = async () => {
      try {
        const [storesRes, usersRes, typesRes] = await Promise.all([
          api.get("/stores"),
          api.get("/users"),
          api.get("/requirement-types"),
        ]);
        setStores(storesRes.data.data || storesRes.data || []);
        setUsers(usersRes.data.data || usersRes.data || []);
        setTypes(typesRes.data.data || typesRes.data || []);
      } catch { message.error("加载数据失败"); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  const addReqItem = () => setReqItems([...reqItems, ""]);
  const removeReqItem = (idx: number) => setReqItems(reqItems.filter((_, i) => i !== idx));
  const updateReqItem = (idx: number, val: string) => {
    const next = [...reqItems];
    next[idx] = val;
    setReqItems(next);
  };

  const onFinish = async (values: any) => {
    setSubmitting(true);
    try {
      // Build description from structured fields
      const descParts: string[] = [];
      if (values.imageSize) descParts.push(`图片尺寸：${values.imageSize}`);
      if (values.usageLocation) descParts.push(`使用位置：${values.usageLocation}`);
      if (values.referenceLink) descParts.push(`参考链接：${values.referenceLink}`);
      if (values.originalLink) descParts.push(`原图链接：${values.originalLink}`);
      if (selectedType) {
        const t = typeDescriptions.find(td => td.value === selectedType);
        if (t) descParts.push(`需求类型：${t.label}-${t.desc}`);
      }
      const validItems = reqItems.filter(i => i.trim());
      if (validItems.length > 0) {
        descParts.push(`修改需求：\n${validItems.map((item, i) => `${i + 1}. ${item}`).join("\n")}`);
      }
      const description = descParts.join("\n---\n");

      const payload: any = {
        title: values.title,
        description,
        productCode: values.productCode || null,
        isUrgent: values.isUrgent || false,
        priority: values.priority || "MEDIUM",
        storeId: values.storeId || null,
        assigneeId: values.assigneeId || null,
      };

      const res = await taskApi.create(payload);
      const task = res.data.data || res.data;
      message.success("法旨发布成功");
      router.push(`/dashboard/fazhi/${task.id}`);
    } catch { message.error("发布失败"); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/dashboard/fazhi")}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>发布法旨</Title>
      </Space>

      <Form form={form} layout="vertical" onFinish={onFinish}
        initialValues={{ priority: "MEDIUM", isUrgent: false }}>
        
        {/* ═══════ 卡片一：基础信息 ═══════ */}
        <Card title="一、基础信息" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="title" label="法旨标题" rules={[{ required: true, message: "请输入标题" }]}>
                <Input placeholder="例如：首页Banner设计" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productCode" label="产品编号">
                <Input placeholder="SKU 或产品编码" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="storeId" label="店铺">
                <Select allowClear placeholder="选择店铺" 
                  options={stores.map((s: any) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="优先级">
                <Select options={[
                  { value: "LOW", label: "低" },
                  { value: "MEDIUM", label: "中" },
                  { value: "HIGH", label: "高" },
                  { value: "URGENT", label: "紧急" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isUrgent" label="紧急需求" valuePropName="checked">
                <Switch checkedChildren="是" unCheckedChildren="否" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="imageSize" label="图片尺寸">
                <Input placeholder="例如：800×800、1920×1080" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="usageLocation" label="使用位置">
                <Select allowClear placeholder="选择使用位置"
                  options={[
                    { value: "主图", label: "主图" },
                    { value: "详情页", label: "详情页" },
                    { value: "A+页面", label: "A+页面" },
                    { value: "广告图", label: "广告图" },
                    { value: "包装设计", label: "包装设计" },
                  ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="assigneeId" label="指定负责人">
            <Select allowClear placeholder="选择负责人"
              options={users.map((u: any) => ({ value: u.id, label: `${u.displayName} (${u.username})` }))} />
          </Form.Item>
        </Card>

        {/* ═══════ 卡片二：需求类型 ═══════ */}
        <Card title="二、需求类型" style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            【快速分类 · 填表不选错】
          </Text>
          <Row gutter={12}>
            {typeDescriptions.map((t, i) => (
              <Col span={6} key={t.value}>
                <Card
                  hoverable
                  size="small"
                  style={{
                    border: selectedType === t.value ? `2px solid ${typeColors[i]}` : "1px solid #f0f0f0",
                    background: selectedType === t.value ? `${typeColors[i]}10` : "#fff",
                  }}
                  onClick={() => setSelectedType(t.value)}
                >
                  <Tag color={typeColors[i]}>{i + 1}</Tag>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{t.label}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t.desc}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>

        {/* ═══════ 卡片三：素材上传 ═══════ */}
        <Card title="三、素材上传" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="referenceLink" label="参考链接">
                <Input placeholder="参考图 URL" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="originalLink" label="原图链接">
                <Input placeholder="原材料 URL" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ═══════ 卡片四：修改需求 ═══════ */}
        <Card title="四、修改需求" style={{ marginBottom: 16 }}
          extra={<Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addReqItem}>添加</Button>}>
          {reqItems.map((item, idx) => (
            <Row gutter={8} key={idx} style={{ marginBottom: 8 }}>
              <Col flex="auto">
                <Input
                  placeholder={`${idx + 1}. 请描述修改需求`}
                  value={item}
                  onChange={(e) => updateReqItem(idx, e.target.value)}
                />
              </Col>
              <Col>
                {reqItems.length > 1 && (
                  <Button icon={<DeleteOutlined />} onClick={() => removeReqItem(idx)} danger />
                )}
              </Col>
            </Row>
          ))}
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
            每行一条修改需求，可点击“添加”增加更多
          </Text>
        </Card>

        {/* ═══════ 规则提醒 ═══════ */}
        <Card style={{ marginBottom: 16, background: "#fffbe6", borderColor: "#ffe58f" }}>
          <Text type="warning" style={{ fontSize: 13 }}>
            【简易规则提醒】<br />
            1. 中途改需求/加内容 = 新需求、重新排期<br />
            2. 因其他因素无法提供合格素材可与设计师沟通
          </Text>
        </Card>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting} size="large" block>
            确认发布
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
