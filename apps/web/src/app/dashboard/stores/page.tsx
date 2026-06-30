'use client';

import { useState, useEffect } from "react";
import { Card, Table, Button, Modal, Form, Input, Space, Typography, message, Popconfirm, Tag } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import api from "@/lib/api";

const { Title } = Typography;

export default function StoresPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/stores"); setData(r.data.data || r.data || []); }
    catch { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (record: any) => { setEditItem(record); form.setFieldsValue(record); setModalOpen(true); };

  const onFinish = async (values: any) => {
    setSubmitting(true);
    try {
      if (editItem) {
        await api.patch(`/stores/${editItem.id}`, values);
        message.success("已更新");
      } else {
        await api.post("/stores", values);
        message.success("已创建");
      }
      setModalOpen(false);
      load();
    } catch { message.error("操作失败"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/stores/${id}`); message.success("已删除"); load(); }
    catch { message.error("删除失败"); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "编码", dataIndex: "code", key: "code", width: 160 },
    { title: "描述", dataIndex: "description", key: "description", ellipsis: true },
    { title: "状态", dataIndex: "isActive", key: "isActive", width: 80,
      render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
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
        <Title level={4} style={{ margin: 0 }}>店铺管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增店铺</Button>
      </div>
      <Card><Table dataSource={data} columns={columns} rowKey="id" loading={loading} pagination={false} scroll={{ x: 700 }} /></Card>

      <Modal title={editItem ? "编辑店铺" : "新增店铺"} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="编码" rules={[{ required: true, message: "请输入编码" }]}>
            <Input disabled={!!editItem} />
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={submitting}>保存</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
