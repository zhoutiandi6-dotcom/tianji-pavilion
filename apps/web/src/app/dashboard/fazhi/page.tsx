'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Space,
  Card, Table, Button, Input, Select, Tag, Space, Typography, Row, Col, message, Modal,
} from "antd";
import { Space,
  PlusOutlined, SearchOutlined, DeleteOutlined, ExclamationCircleOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import { taskApi } from "@/lib/api";
import api from "@/lib/api";

const { Title } = Typography;

const statusColors: Record<string, string> = {
  PENDING: "default",
  IN_PROGRESS: "processing",
  COMPLETED: "success",
  CANCELLED: "error",
};

const statusLabels: Record<string, string> = {
  PENDING: "待处理",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const priorityColors: Record<string, string> = {
  LOW: "default",
  MEDIUM: "blue",
  HIGH: "orange",
  URGENT: "red",
};

const priorityLabels: Record<string, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  URGENT: "紧急",
};

export default function FazhiListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>();
  const [stores, setStores] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const res = await taskApi.findAll(params);
      setData(res.data.data || res.data);
    } catch { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    // Get current user info + stores + users
    const init = async () => {
      try {
        const meRes = await api.get("/auth/me");
        const me = meRes.data.data || meRes.data;
        setCurrentUser(me);
        const [storesRes, usersRes] = await Promise.all([
          api.get("/stores"),
          api.get("/users"),
        ]);
        setStores(storesRes.data.data || storesRes.data || []);
        setUsers(usersRes.data.data || usersRes.data || []);
      } catch { /* ignore */ }
    };
    init();
  }, []);

  useEffect(() => { loadData(); }, [page, pageSize, statusFilter, priorityFilter]);

  const handleSearch = () => { setPage(1); loadData(); };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: "确认删除此法旨?",
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        try {
          await taskApi.remove(id);
          message.success("已删除");
          loadData();
        } catch { message.error("删除失败"); }
      },
    });
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await taskApi.updateStatus(id, status);
      message.success("状态已更新");
      loadData();
    } catch { message.error("操作失败"); }
  };

  const columns = [
    {
      title: "标题", dataIndex: "title", key: "title",
      render: (text: string, record: any) => (
        <Space>
          {record.isUrgent && <Tag icon={<ThunderboltOutlined />} color="red">紧急</Tag>}
          <a onClick={() => router.push(`/dashboard/fazhi/${record.id}`)}>{text}</a>
        </Space>
      ),
    },
    {
      title: "产品编号", dataIndex: "productCode", key: "productCode", width: 140,
      render: (v: string) => v || "-",
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 120,
      render: (status: string) => <Tag color={statusColors[status]}>{statusLabels[status] || status}</Tag>,
    },
    {
      title: "优先级", dataIndex: "priority", key: "priority", width: 80,
      render: (p: string) => <Tag color={priorityColors[p]}>{priorityLabels[p] || p}</Tag>,
    },
    {
      title: "创建人", dataIndex: "creator", key: "creator", width: 120,
      render: (c: any) => c?.displayName || "-",
    },
    {
      title: "负责人", dataIndex: "assignee", key: "assignee", width: 120,
      render: (a: any) => a?.displayName || "-",
    },
    {
      title: "店铺", dataIndex: "store", key: "store", width: 120,
      render: (s: any) => s?.name || "-",
    },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 160,
      render: (d: string) => new Date(d).toLocaleString("zh-CN"),
    },
    {
      title: "操作", key: "actions", width: 160,
      render: (_: any, record: any) => (
        <Space>
          {currentUser?.role !== "DESIGNER" && (
            <Select
              size="small"
              value={record.status}
              style={{ width: 90 }}
              onChange={(val) => handleStatusChange(record.id, val)}
              options={Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v }))}
            />
          )}
          <Button type="link" danger size="small" icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>法旨中心</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/dashboard/fazhi/new")}>
          发布法旨
        </Button>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <Input
              placeholder="搜索标题/描述"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="状态"
              allowClear
              style={{ width: "100%" }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="优先级"
              allowClear
              style={{ width: "100%" }}
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={Object.entries(priorityLabels).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="店铺"
              allowClear
              style={{ width: "100%" }}
              onChange={(val) => {/* store filter not implemented yet in search */}}
              options={stores.map((s: any) => ({ value: s.id, label: s.name }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Button type="primary" onClick={handleSearch}>搜索</Button>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          dataSource={data.items}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total: data.total,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
          }}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
}
