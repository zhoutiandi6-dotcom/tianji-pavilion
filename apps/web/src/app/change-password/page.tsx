'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Form, Input, Button, Typography, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import api from "@/lib/api";

const { Title, Text } = Typography;

export default function ChangePasswordPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) {
      router.replace("/login");
    }
  }, [router]);

  const onFinish = async (values: { oldPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error("两次密码不一致");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success("密码修改成功，请重新登录");
      localStorage.removeItem("accessToken");
      router.replace("/login");
    } catch {
      message.error("密码修改失败，请检查原密码");
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
      <Card style={{ width: 420, borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
        styles={{ body: { padding: 40 } }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Title level={2} style={{ margin: 0, color: "#1a1a2e" }}>修改密码</Title>
          <Text type="secondary">首次登录，请设置新密码</Text>
        </div>

        <Form name="changePassword" onFinish={onFinish} layout="vertical" size="large">
          <Form.Item name="oldPassword" label="原密码"
            rules={[{ required: true, message: "请输入原密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Admin初始密码: admin123" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 6, message: "密码至少6位" },
            ]}>
            <Input.Password prefix={<LockOutlined />} placeholder="至少6位" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码"
            rules={[
              { required: true, message: "请再次输入新密码" },
              ({ getFieldValue }: any) => ({
                validator(_: any, value: string) {
                  if (!value || getFieldValue("newPassword") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("两次密码不一致"));
                },
              }),
            ]}>
            <Input.Password prefix={<LockOutlined />} placeholder="再次输入新密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>确认修改</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
