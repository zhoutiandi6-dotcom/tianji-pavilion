'use client';

import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import { CheckCircleOutlined, DeleteOutlined, EditOutlined, LockOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import api, { getErrorMessage } from "@/lib/api";
import RoleGate from "@/components/RoleGate";
import { cleanDisplayText, displayName } from "@/lib/display";

const { Title, Text } = Typography;

const roleLabels: Record<string, string> = {
  OWNER: "系统所有者",
  SUPER_ADMIN: "超级管理员",
  OPERATION_MANAGER: "运营主管",
  OPERATION: "运营",
  DESIGNER: "设计师",
  DESIGN_MANAGER: "设计主管",
  GUEST: "未激活",
};

const roleColors: Record<string, string> = {
  OWNER: "gold",
  SUPER_ADMIN: "red",
  OPERATION_MANAGER: "blue",
  OPERATION: "orange",
  DESIGNER: "green",
  DESIGN_MANAGER: "purple",
  GUEST: "default",
};

function UsersPageContent() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        api.get("/users"),
        api.get("/roles-permissions/roles"),
      ]);
      setData(uRes.data.data || uRes.data || []);
      setRoles(rRes.data.data || rRes.data || []);
    } catch (err) {
      console.error("[users] load failed", err);
      message.error(getErrorMessage(err, "加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get("/auth/me").then((res) => setCurrentUser(res.data.data || res.data)).catch(() => {});
    load();
  }, []);

  const openCreate = () => {
    setEditItem(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditItem(record);
    form.setFieldsValue({ displayName: cleanDisplayText(record.displayName), roleId: record.roleId });
    setModalOpen(true);
  };

  const onFinish = async (values: any) => {
    setSubmitting(true);
    try {
      if (editItem) {
        const payload: any = {};
        if (values.displayName?.trim()) payload.displayName = values.displayName.trim();
        if (values.roleId) payload.roleId = values.roleId;
        await api.patch("/users/" + editItem.id, payload);
        message.success("已更新");
      } else {
        await api.post("/users", {
          username: values.username,
          password: values.password,
          displayName: values.displayName,
          roleId: values.roleId,
        });
        message.success("已创建，新用户默认为未激活状态，请管理员手动启用");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      console.error("[users] save failed", err);
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      await api.post(`/users/${id}/activate`);
      message.success("已启用");
      load();
    } catch (err) {
      console.error("[users] activate failed", err);
      message.error(getErrorMessage(err));
    }
  };

  const handleDeactivate = async (id: number) => {
    try {
      await api.post(`/users/${id}/deactivate`);
      message.success("已禁用");
      load();
    } catch (err) {
      console.error("[users] deactivate failed", err);
      message.error(getErrorMessage(err));
    }
  };

  const handleDeleteTestUser = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      message.success("测试用户已删除");
      load();
    } catch (err) {
      console.error("[users] delete test user failed", err);
      message.error(getErrorMessage(err));
    }
  };

  const handleResetPassword = async (id: number) => {
    try {
      const res = await api.post(`/users/${id}/reset-password`);
      const d = res.data.data || res.data;
      message.success(`密码已重置为: ${d.defaultPassword || "123456"}`);
    } catch (err) {
      console.error("[users] reset password failed", err);
      message.error(getErrorMessage(err));
    }
  };

  const hasOwnerRole = (user: any) => user?.role === "OWNER";
  const isSelf = (user: any) => user?.id === currentUser?.id;

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    {
      title: "姓名",
      dataIndex: "displayName",
      key: "displayName",
      render: (_: any, record: any) => (
        <Space direction="vertical" size={0}>
          <Text>{displayName(record.displayName, record.username || "未填写")}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>登录账号：{displayName(record.username)}</Text>
        </Space>
      ),
    },
    { title: "邮箱", dataIndex: "email", key: "email", width: 180 },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      width: 120,
      render: (role: string) => <Tag color={roleColors[role] || "default"}>{roleLabels[role] || role}</Tag>,
    },
    {
      title: "状态",
      dataIndex: "isActive",
      key: "isActive",
      width: 80,
      render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>,
    },
    {
      title: "密码状态",
      dataIndex: "mustChangePassword",
      key: "mustChangePassword",
      width: 100,
      render: (value: boolean) => value ? <Tag color="orange">需改密</Tag> : <Tag>正常</Tag>,
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      render: (_: any, record: any) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          {!isSelf(record) && !record.isActive ? (
            <Button type="link" size="small" icon={<CheckCircleOutlined />} style={{ color: "#52c41a" }} onClick={() => handleActivate(record.id)}>启用</Button>
          ) : (
            !isSelf(record) && !hasOwnerRole(record) && (
              <Popconfirm title="确认禁用此账号?" onConfirm={() => handleDeactivate(record.id)}>
                <Button type="link" danger size="small" icon={<StopOutlined />}>禁用</Button>
              </Popconfirm>
            )
          )}
          {!isSelf(record) && !hasOwnerRole(record) && (
            <Popconfirm title="仅无业务关系的测试用户可删除；有历史记录请改为停用。确认删除？" onConfirm={() => handleDeleteTestUser(record.id)}>
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除测试用户</Button>
            </Popconfirm>
          )}
          <Popconfirm title="确认重置密码为 123456?" onConfirm={() => handleResetPassword(record.id)}>
            <Button type="link" size="small" icon={<LockOutlined />}>重置密码</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>用户管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button>
      </div>

      <Card>
        <Table dataSource={data} columns={columns} rowKey="id" loading={loading} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: "暂无用户数据" }} />
      </Card>

      <Modal title={editItem ? "编辑用户" : "新增用户"} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {!editItem && (
            <>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="displayName" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
                <Input placeholder="用于页面展示，例如 张佳琪" />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "至少6位" }]}>
                <Input.Password />
              </Form.Item>
            </>
          )}

          {editItem && (
            <>
              <Form.Item name="displayName" label="姓名">
                <Input placeholder="留空则不修改" />
              </Form.Item>
              <Form.Item label="当前角色">
                <Tag color={roleColors[editItem.role] || "default"}>{roleLabels[editItem.role] || editItem.role}</Tag>
              </Form.Item>
            </>
          )}

          {editItem && hasOwnerRole(editItem) ? (
            <Text type="warning">系统所有者角色不可修改</Text>
          ) : (
            <Form.Item name="roleId" label={editItem ? "新角色" : "角色"} rules={editItem ? [] : [{ required: true, message: "请选择角色" }]}>
              <Select
                allowClear={!!editItem}
                options={roles
                  .filter((role: any) => role.name !== "OWNER" && role.name !== "GUEST")
                  .map((role: any) => ({ value: role.id, label: roleLabels[role.name] || role.name }))}
              />
            </Form.Item>
          )}

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {editItem ? "保存修改" : "创建用户"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function UsersPage() {
  return <RoleGate allowedRoles={["OWNER", "SUPER_ADMIN"]}><UsersPageContent /></RoleGate>;
}
