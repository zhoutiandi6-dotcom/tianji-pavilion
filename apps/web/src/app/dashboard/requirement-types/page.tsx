'use client';

import { useState, useEffect } from "react";
import { Card, Table, Button, Modal, Form, Input, InputNumber, Space, Typography, message, Popconfirm } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import api from "@/lib/api";
import RoleGate from "@/components/RoleGate";

const { Title } = Typography;

function RequirementTypesPageContent() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/requirement-types"); setData(r.data.data || r.data || []); }
    catch { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: any) => { setEditItem(r); form.setFieldsValue(r); setModalOpen(true); };

  const onFinish = async (values: any) => {
    setSubmitting(true);
    try {
      if (editItem) { await api.patch(`/requirement-types/${editItem.id}`, values); message.success("已更新"); }
      else { await api.post("/requirement-types", values); message.success("已创建"); }
      setModalOpen(false); load();
    } catch { message.error("操作失败"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/requirement-types/${id}`); message.success("已删除"); load(); }
    catch { message.error("删除失败"); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "描述", dataIndex: "description", key: "description", ellipsis: true },
    { title: "排序", dataIndex: "sortOrder", key: "sortOrder", width: 80 },
    { title: "操作", key: "actions", width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>需求类型管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增类型</Button>
      </div>
      <Card><Table dataSource={data} columns={columns} rowKey="id" loading={loading} pagination={false} /></Card>

      <Modal title={editItem ? "编辑类型" : "新增类型"} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="sortOrder" label="排序"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={submitting}>保存</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function RequirementTypesPage() {
  return <RoleGate allowedRoles={["OWNER", "SUPER_ADMIN"]}><RequirementTypesPageContent /></RoleGate>;
}

