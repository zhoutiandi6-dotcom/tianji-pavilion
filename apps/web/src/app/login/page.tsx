'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Card, message, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import api, { API_BASE_URL, authApi } from "@/lib/api";

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Milestone A: Check if system is initialized
  useEffect(() => {
    api.get("/auth/init-status").then((res) => {
      const d = res.data.data || res.data;
      if (!d.initialized) {
        router.replace("/setup");
      }
    }).catch(() => {});
  }, [router]);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      console.log("[login] API base URL:", API_BASE_URL);
      console.log("[login] Request URL:", `${API_BASE_URL}/auth/login`);
      const res = await authApi.login(values.username, values.password);
      console.log("[login] Response status:", res.status);
      const data = res.data.data || res.data;
      localStorage.setItem("accessToken", data.accessToken);

      if (data.mustChangePassword) {
        message.warning("首次登录，请修改密码");
        router.replace("/change-password");
      } else {
        message.success("登录成功");
        router.replace("/dashboard");
      }
    } catch (err: any) {
      console.error("[login] Login failed:", {
        status: err?.response?.status,
        code: err?.response?.data?.code,
        message: err?.response?.data?.message || err?.message,
        requestUrl: `${API_BASE_URL}/auth/login`,
      });
      const status = err?.response?.status;
      const msg = !err?.response
        ? "无法连接服务器，请检查后端服务或网络"
        : status === 401
          ? "账号或密码错误"
          : status >= 500
            ? "服务器错误，请联系管理员"
            : err?.response?.data?.message || "登录失败，请稍后重试";
      message.error(msg);
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
          <Title level={2} style={{ margin: "4px 0", color: "#1a1a2e" }}>天机阁</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>TianJi Pavilion</Text>
          <Text type="secondary" style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", display: "block" }}>企业内部设计协作管理平台</Text>
        </div>

        <Form name="login" onFinish={onFinish} layout="vertical" size="large">
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
            仅限企业内部员工使用 · 账号由管理员创建
          </Text>
        </div>
      </Card>
    </div>
  );
}
