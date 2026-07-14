'use client';

import { useState } from "react";
import { Modal, Form, Input, Select, Button, message } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import api from "@/lib/api";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // Public endpoint — no auth required for submission
      await api.post("/feedback", values);
      message.success("感谢您的反馈！");
      setOpen(false);
      form.resetFields();
    } catch {
      message.error("提交失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <div
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000,
          width: 48, height: 48, borderRadius: "50%",
          background: "#1677ff", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", boxShadow: "0 4px 12px rgba(22,119,255,0.4)",
          fontSize: 20,
        }}
        title="反馈意见"
      >
        <MessageOutlined />
      </div>

      <Modal title="天机阁内测反馈" open={open} onCancel={() => setOpen(false)}
        footer={null} destroyOnClose width={480}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="role" label="您的角色" rules={[{ required: true, message: "请选择角色" }]}>
            <Select options={[
              { value: "admin", label: "管理员" },
              { value: "operator", label: "运营" },
              { value: "designer", label: "设计师" },
              { value: "dm", label: "设计主管" },
              { value: "other", label: "其他" },
            ]} />
          </Form.Item>
          <Form.Item name="module" label="反馈模块" rules={[{ required: true, message: "请选择模块" }]}>
            <Select options={[
              { value: "login", label: "登录" },
              { value: "fazhi", label: "法旨中心" },
              { value: "approval", label: "审批流程" },
              { value: "dashboard", label: "首页仪表板" },
              { value: "announcement", label: "公告" },
              { value: "user", label: "用户管理" },
              { value: "setting", label: "系统设置" },
              { value: "other", label: "其他" },
            ]} />
          </Form.Item>
          <Form.Item name="severity" label="严重程度" initialValue="normal">
            <Select options={[
              { value: "critical", label: "🔴 严重" },
              { value: "major", label: "🟡 主要" },
              { value: "normal", label: "🔵 一般" },
              { value: "minor", label: "🟢 轻微" },
              { value: "suggestion", label: "💡 建议" },
            ]} />
          </Form.Item>
          <Form.Item name="description" label="问题描述" rules={[{ required: true, message: "请描述问题" }]}>
            <Input.TextArea rows={3} placeholder="请详细描述您遇到的问题..." />
          </Form.Item>
          <Form.Item name="suggestion" label="改进建议">
            <Input.TextArea rows={2} placeholder="如有改进建议请在此填写（可选）" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>提交反馈</Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
