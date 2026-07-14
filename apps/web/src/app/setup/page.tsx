'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Form, Input, Button, Typography, message, Steps, Result } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import api from "@/lib/api";

const { Title, Text } = Typography;

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [form] = Form.useForm();
  const router = useRouter();

  useEffect(() => {
    api.get("/auth/init-status").then((res) => {
      const d = res.data.data || res.data;
      if (d.initialized) {
        setInitialized(true);
        router.replace("/login");
      }
    }).catch(() => {}).finally(() => setChecking(false));
  }, [router]);

  const onFinish = async (values: { username: string; password: string; displayName: string }) => {
    setLoading(true);
    try {
      await api.post("/auth/init", {
        username: values.username,
        password: values.password,
        displayName: values.displayName,
      });
      message.success("系统初始化完成！请使用刚创建的账号登录");
      setStep(1);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "初始化失败");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
        <Card style={{ width: 480, textAlign: "center" }}><Text>正在检查系统状态...</Text></Card>
      </div>
    );
  }

  if (initialized) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
      <Card style={{ width: 480, borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
        styles={{ body: { padding: 40 } }}>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0, color: "#1a1a2e" }}>天机阁 · 系统初始化</Title>
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            首次运行请创建系统所有者账号
          </Text>
        </div>

        <Steps current={step} size="small" style={{ marginBottom: 24 }}
          items={[{ title: "创建 Owner" }, { title: "完成" }]} />

        {step === 0 && (
          <>
            <Text type="secondary" style={{ display: "block", marginBottom: 16, fontSize: 13 }}>
              系统所有者（Owner）拥有全部权限，包括用户管理、系统设置、数据维护等。<br />
              此账号唯一且不可删除，请妥善保管。
            </Text>
            <Form form={form} layout="vertical" size="large" onFinish={onFinish}>
              <Form.Item name="displayName" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
                <Input placeholder="如：系统管理员" />
              </Form.Item>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }, { min: 3, message: "至少3位" }]}>
                <Input prefix={<UserOutlined />} placeholder="admin" />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "至少6位" }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="至少6位密码" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={loading} block size="large">创建系统所有者</Button>
              </Form.Item>
            </Form>
          </>
        )}

        {step === 1 && (
          <Result
            status="success"
            title="系统初始化完成"
            subTitle="系统所有者账号已创建，请返回登录页使用新账号登录"
            extra={[
              <Button type="primary" key="login" onClick={() => router.push("/login")}>前往登录</Button>,
            ]}
          />
        )}
      </Card>
    </div>
  );
}
