'use client';
import { useState, useEffect } from "react";
import { Card, Descriptions, Typography, Tag, Form, Input, Button, message, Spin } from "antd";
import { useTheme } from "@/lib/context/theme";
import api, { API_BASE_URL } from "@/lib/api";
import RoleGate from "@/components/RoleGate";
import { displayUserName } from "@/lib/display";

const { Title } = Typography;

function SettingsPageContent() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { mode } = useTheme();
  const [form] = Form.useForm();

  useEffect(() => {
    Promise.all([
      api.get("/system-config"),
      api.get("/auth/me"),
    ]).then(([cfg, me]) => {
      const c = cfg.data.data || cfg.data;
      setConfig(c);
      setUser(me.data.data || me.data);
      form.setFieldsValue({
        site_name: c.site_name || "天机阁",
        site_subtitle: c.site_subtitle || "TianJi Pavilion",
        site_description: c.site_description || "",
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [form]);

  const onSave = async (values: any) => {
    setSaving(true);
    try {
      await api.put("/system-config", values);
      message.success("系统设置已保存");
    } catch { message.error("保存失败"); }
    finally { setSaving(false); }
  };

  if (loading) return <Spin style={{ display: "block", margin: "100px auto" }} />;

  const canManageSettings = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";

  return (
    <div style={{ maxWidth: 800 }}>
      <Title level={4} style={{ marginBottom: 24 }}>系统设置</Title>

      {canManageSettings && (
        <Card title="基本设置" style={{ marginBottom: 16 }}>
          <Form form={form} layout="vertical" onFinish={onSave} style={{ maxWidth: 400 }}>
            <Form.Item name="site_name" label="系统名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="site_subtitle" label="副标题">
              <Input />
            </Form.Item>
            <Form.Item name="site_description" label="描述">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>保存设置</Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      <Card title="系统信息" style={{ marginBottom: 16 }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="系统名称">{config.site_name || "天机阁"}</Descriptions.Item>
          <Descriptions.Item label="版本">{config.site_version || "V1.0.0"}</Descriptions.Item>
          <Descriptions.Item label="技术栈">Next.js + NestJS + Prisma + Ant Design</Descriptions.Item>
          <Descriptions.Item label="当前用户">{displayUserName(user)} ({user?.role || "-"})</Descriptions.Item>
          <Descriptions.Item label="用户角色">
            <Tag color={user?.role === "OWNER" ? "gold" : "blue"}>{user?.role}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="显示设置" style={{ marginBottom: 16 }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="深色模式">
            <Tag color={mode === "dark" ? "blue" : "default"}>{mode === "dark" ? "开启" : "关闭"}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="环境配置">
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="后端地址">{API_BASE_URL}</Descriptions.Item>
          <Descriptions.Item label="认证方式">JWT + RBAC + Owner</Descriptions.Item>
          <Descriptions.Item label="数据库">SQLite</Descriptions.Item>
          <Descriptions.Item label="部署方式">Docker / 本地 Node.js</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return <RoleGate allowedRoles={["OWNER", "SUPER_ADMIN"]}><SettingsPageContent /></RoleGate>;
}

