'use client';

import type React from "react";
import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Layout, Menu, Button, Dropdown, Typography, Badge, Space } from "antd";
import {
  HomeOutlined, FileTextOutlined, ShopOutlined, TagsOutlined,
  TeamOutlined, SettingOutlined, LogoutOutlined,
  BellOutlined, BulbOutlined, BulbFilled, MessageOutlined,
} from "@ant-design/icons";
import { authApi } from "@/lib/api";
import api from "@/lib/api";
import GlobalSearch from "@/components/GlobalSearch";
import { useTheme } from "@/lib/context/theme";
import Loading from "@/components/Loading";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import FeedbackWidget from "@/components/FeedbackWidget";
import { displayUserName } from "@/lib/display";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const getMenuItems = (role: string) => {
  const common = [
    { key: "/dashboard", icon: <HomeOutlined />, label: "首页" },
  ];
  const notifications = { key: "/dashboard/notifications", icon: <BellOutlined />, label: "通知中心" };
  const fazhiCenter = { key: "/dashboard/fazhi?scope=processing", icon: <FileTextOutlined />, label: "法旨中心" };

  if (role === "OPERATION") {
    return [
      ...common,
      { key: "/dashboard/fazhi?view=all", icon: <FileTextOutlined />, label: "我的法旨" },
      { key: "/dashboard/fazhi/new", icon: <FileTextOutlined />, label: "新建法旨" },
      { key: "/dashboard/feedback", icon: <MessageOutlined />, label: "反馈中心" },
      notifications,
    ];
  }

  if (role === "OPERATION_MANAGER") {
    return [
      ...common,
      fazhiCenter,
      { key: "/dashboard/fazhi?scope=ops-approvals", icon: <FileTextOutlined />, label: "待我审批" },
      { key: "/dashboard/weekly-operations-approval-plans", icon: <FileTextOutlined />, label: "本周审批计划" },
      { key: "/dashboard/feedback", icon: <MessageOutlined />, label: "反馈中心" },
      notifications,
    ];
  }

  if (role === "DESIGN_MANAGER") {
    return [
      ...common,
      fazhiCenter,
      { key: "/dashboard/fazhi?scope=design-assignment", icon: <FileTextOutlined />, label: "待分配" },
      { key: "/dashboard/fazhi?scope=design-reviews", icon: <FileTextOutlined />, label: "待审核" },
      { key: "/dashboard/fazhi?scope=design-tasks", icon: <FileTextOutlined />, label: "设计任务" },
      { key: "/dashboard/weekly-designer-plans", icon: <FileTextOutlined />, label: "本周计划" },
      notifications,
    ];
  }

  if (role === "DESIGNER") {
    return [
      ...common,
      { key: "/dashboard/fazhi?scope=processing", icon: <FileTextOutlined />, label: "我的设计任务" },
      notifications,
    ];
  }

  if (["OWNER", "SUPER_ADMIN"].includes(role)) {
    return [
      ...common,
      fazhiCenter,
      { key: "/dashboard/stores", icon: <ShopOutlined />, label: "店铺管理" },
      { key: "/dashboard/requirement-types", icon: <TagsOutlined />, label: "需求类型" },
      { key: "/dashboard/users", icon: <TeamOutlined />, label: "用户管理" },
      { key: "/dashboard/logs", icon: <SettingOutlined />, label: "操作日志" },
      notifications,
      { key: "/dashboard/feedback", icon: <MessageOutlined />, label: "反馈管理" },
      { key: "/dashboard/settings", icon: <SettingOutlined />, label: "系统设置" },
    ];
  }

  return common;
};

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notifCount, setNotifCount] = useState(0);
  const [notifs, setNotifs] = useState<any[]>([]);
  const { mode, toggle: toggleTheme } = useTheme();

  const loadNotifs = async () => {
    try {
      const r = await api.get("/notifications/unread-count");
      const c = r.data?.count || r.data?.data?.count || 0;
      setNotifCount(c);
      if (c > 0) {
        const nr = await api.get("/notifications?pageSize=5");
        const nd = nr.data.data || nr.data;
        setNotifs(nd.items || []);
      }
    } catch {
      setNotifCount(0);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.replace("/login"); return; }
    authApi.getMe().then((res) => {
      const d = res.data.data || res.data;
      setUser({ displayName: d.displayName, username: d.username, role: d.role });
    }).catch(() => { localStorage.removeItem("accessToken"); router.replace("/login"); })
    .finally(() => setLoading(false));
    loadNotifs();
    const iv = setInterval(loadNotifs, 30000);
    return () => clearInterval(iv);
  }, [router]);

  const handleLogout = () => { localStorage.removeItem("accessToken"); router.replace("/login"); };

  if (loading) return <Loading />;

  const scope = searchParams.get("scope");
  const selectedKey = pathname === "/dashboard/fazhi" && user?.role === "OPERATION"
    ? "/dashboard/fazhi?view=all"
    : pathname === "/dashboard/fazhi" && scope
    ? `/dashboard/fazhi?scope=${scope}`
    : "/" + pathname.split("/").slice(1, 3).join("/");

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", background: "#001529", height: 64, position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Text strong style={{ color: "#fff", fontSize: 20, letterSpacing: 2 }}>天机阁</Text>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>TianJi Pavilion</Text>
        </div>
        <Space>
          <GlobalSearch />
          <Dropdown
            menu={{
              items: [
                { key: "notifHeader", label: "通知中心", disabled: true },
                { type: "divider" },
                ...notifs.slice(0, 5).map((n: any) => ({
                  key: "n" + n.id,
                  label: (n.isRead ? "" : "• ") + n.title,
                  onClick: () => router.push("/dashboard/notifications"),
                })),
                { type: "divider" },
                { key: "all", label: "所有通知", onClick: () => router.push("/dashboard/notifications") },
              ],
            }}
          >
            <Badge count={notifCount} size="small">
              <Button type="text" style={{ color: "#fff" }} icon={<BellOutlined />} />
            </Badge>
          </Dropdown>
          <Button type="text" style={{ color: "#fff" }}
            icon={mode === "dark" ? <BulbFilled /> : <BulbOutlined />}
            onClick={toggleTheme} />
          <Dropdown
            menu={{
              items: [
                { key: "user", label: displayUserName(user) + " (" + user?.role + ")", disabled: true },
                { type: "divider" },
                { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true },
              ],
              onClick: ({ key }) => { if (key === "logout") handleLogout(); },
            }}
          >
            <Button type="text" style={{ color: "#fff" }} icon={<span>👤</span>}>{displayUserName(user)}</Button>
          </Dropdown>
        </Space>
      </Header>
      <Layout style={{ marginTop: 64 }}>
        <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={220}
          style={{ position: "fixed", left: 0, top: 64, bottom: 0, overflow: "auto", background: "#fff", borderRight: "1px solid #f0f0f0" }}>
          <Menu mode="inline" selectedKeys={[selectedKey]}
            items={getMenuItems(user?.role || "")}
            onClick={({ key }) => router.push(key)}
            style={{ border: "none", marginTop: 8 }} />
        </Sider>
        <Content style={{ marginLeft: collapsed ? 80 : 220, padding: 24, minHeight: "calc(100vh - 64px)", transition: "margin-left 0.2s", background: "#f5f5f5" }}>
          <BreadcrumbNav role={user?.role} />
          {children}
          {user && ["OPERATION", "OPERATION_MANAGER", "OWNER", "SUPER_ADMIN"].includes(user.role) && <FeedbackWidget />}
        </Content>
      </Layout>
    </Layout>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading />}>{<DashboardLayoutContent>{children}</DashboardLayoutContent>}</Suspense>;
}





