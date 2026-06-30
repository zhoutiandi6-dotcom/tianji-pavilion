'use client';

import { Card, Typography } from 'antd';
import { TeamOutlined } from '@ant-design/icons';

const { Title } = Typography;

export default function UsersPage() {
  return (
    <Card>
      <div style={{ textAlign: 'center', padding: 60 }}>
        <TeamOutlined style={{ fontSize: 64, color: '#fa8c16' }} />
        <Title level={4} style={{ marginTop: 16 }}>用户管理</Title>
        <p style={{ color: '#999' }}>Sprint 2 将实现用户管理功能</p>
      </div>
    </Card>
  );
}
