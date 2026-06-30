'use client';

import { Card, Typography, Row, Col, Statistic } from 'antd';
import { FileTextOutlined, ShopOutlined, TeamOutlined, TagsOutlined } from '@ant-design/icons';

const { Title } = Typography;

export default function DashboardPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>首页</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic title="法旨总数" value={0} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic title="店铺数" value={0} prefix={<ShopOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic title="用户数" value={0} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic title="需求类型" value={0} prefix={<TagsOutlined />} />
          </Card>
        </Col>
      </Row>
      <Card style={{ marginTop: 16 }}>
        <Title level={5}>欢迎使用天机阁</Title>
        <p>请通过左侧菜单导航访问各个模块。</p>
      </Card>
    </div>
  );
}
