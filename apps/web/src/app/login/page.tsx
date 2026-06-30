'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Card, message, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { authApi } from "@/lib/api";

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await authApi.login(values.username, values.password);
      const data = res.data.data || res.data;
      localStorage.setItem("accessToken", data.accessToken);

      if (data.mustChangePassword) {
        message.warning("首次登录，请修改密码");
        router.replace("/change-password");
      } else {
        message.success("登录成功");
        router.replace("/dashboard");
      }
    } catch {
      message.error("账号或密码错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      }}
    >
      <Card style={{ width: 400, borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
        styles={{ body: { padding: 40 } }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Title level={2} style={{ margin: 0, color: "#1a1a2e" }}>天机阁</Title>
          <Text type="secondary">TianJi Pavilion · 设计协作平台</Text>
        </div>

        <Form name="login" onFinish={onFinish} layout="vertical" size="large"
          initialValues={{ username: "admin", password: "admin123" }}>
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>登 录</Button>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            体验账号: admin / admin123
          </Text>
        </div>
      </Card>
    </div>
  );
}
