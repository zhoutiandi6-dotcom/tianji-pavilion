'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Button, Dropdown, Typography, Spin } from 'antd';
import {
  HomeOutlined,
  FileTextOutlined,
  ShopOutlined,
  TagsOutlined,
  TeamOutlined,
  SettingOutlined,
  BellOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { authApi } from '@/lib/api';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/dashboard', icon: <HomeOutlined />, label: '首页' },
  { key: '/dashboard/fazhi', icon: <FileTextOutlined />, label: '法旨中心' },
  { key: '/dashboard/stores', icon: <ShopOutlined />, label: '店铺管理' },
  { key: '/dashboard/requirement-types', icon: <TagsOutlined />, label: '需求类型' },
  { key: '/dashboard/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/dashboard/settings', icon: <SettingOutlined />, label: '系统设置' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { router.replace('/login'); return; }
    authApi.getMe().then((res) => {
      const data = res.data.data || res.data;
      setUser({ displayName: data.displayName || data.username, username: data.username, role: data.role });
    }).catch(() => {
      localStorage.removeItem('accessToken');
      router.replace('/login');
    }).finally(() => setLoading(false));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    router.replace('/login');
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="正在登录天机阁..." />
      </div>
    );
  }

  const selectedKey = '/' + pathname.split('/').slice(1, 3).join('/');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#001529', height: 64, position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text strong style={{ color: '#fff', fontSize: 20, letterSpacing: 2 }}>天机阁</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>TianJi Pavilion</Text>
        </div>
        <Dropdown menu={{ items: [
          { key: 'user', label: '用户信息', disabled: true },
          { type: 'divider' },
          { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
        ], onClick: ({ key }) => { if (key === 'logout') handleLogout(); } }}>
          <Button type="text" style={{ color: '#fff' }} icon={<UserOutlined />}>{user?.displayName}</Button>
        </Dropdown>
      </Header>
      <Layout style={{ marginTop: 64 }}>
        <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={220} style={{ position: 'fixed', left: 0, top: 64, bottom: 0, overflow: 'auto', background: '#fff', borderRight: '1px solid #f0f0f0' }}>
          <Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} onClick={({ key }) => router.push(key)} style={{ border: 'none', marginTop: 8 }} />
        </Sider>
        <Content style={{ marginLeft: collapsed ? 80 : 220, padding: 24, minHeight: 'calc(100vh - 64px)', transition: 'margin-left 0.2s', background: '#f5f5f5' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
