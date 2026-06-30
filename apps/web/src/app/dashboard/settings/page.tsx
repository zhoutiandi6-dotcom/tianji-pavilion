'use client';

import { Card, Typography, Descriptions } from "antd";

const { Title, Text } = Typography;

export default function SettingsPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>系统设置</Title>
      <Card title="系统信息" style={{ maxWidth: 720 }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="系统名称">天机阁 TianJi Pavilion</Descriptions.Item>
          <Descriptions.Item label="版本">V1.0.0</Descriptions.Item>
          <Descriptions.Item label="Sprint">2 - 后台与通知</Descriptions.Item>
          <Descriptions.Item label="技术栈">Next.js + NestJS + SQLite + Prisma</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title="环境配置" style={{ maxWidth: 720, marginTop: 16 }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="后端地址">{process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"}</Descriptions.Item>
          <Descriptions.Item label="认证方式">JWT + RBAC</Descriptions.Item>
          <Descriptions.Item label="数据库">SQLite</Descriptions.Item>
          <Descriptions.Item label="文件存储">本地服务器</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
