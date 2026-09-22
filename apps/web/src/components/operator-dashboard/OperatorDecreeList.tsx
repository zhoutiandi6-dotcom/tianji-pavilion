'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Dropdown, Input, Modal, Pagination, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { DownloadOutlined, EyeOutlined, MoreOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import { attachmentApi, getErrorMessage, taskApi } from '@/lib/api';
import { DataTableCard, FilterCard, SecondaryEmptyState, SecondaryPageHeader, SecondaryPageShell, SecondaryStatusTag } from '@/components/secondary-page';
import styles from './OperatorDecreeList.module.css';

type ListReturnContext = {
  scrollTop: number;
  lastViewedTaskId: number;
};

function listContextKey(pathWithQuery: string) {
  return `tianji:operator-decree-list:${pathWithQuery}`;
}

const viewOptions = [
  ['all', '全部法旨'],
  ['draft', '我的草稿'],
  ['returnedForSupplement', '待我处理'],
  ['processing', '处理中'],
  ['designCompleted', '设计已完成'],
] as const;

const statusOptions = [
  ['DRAFT', '草稿'],
  ['SUBMITTED', '待主管审批'],
  ['OPS_REJECTED', '退回补充'],
  ['OPS_APPROVED', '待设计分配'],
  ['DESIGN_ASSIGNED', '已分配'],
  ['IN_DESIGN', '设计中'],
  ['DESIGN_REVIEW', '待设计审核'],
  ['DESIGN_APPROVED', '设计已完成'],
] as const;

const statusLabels: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '待主管审批', OPS_REJECTED: '退回补充', OPS_APPROVED: '待设计分配',
  DESIGN_ASSIGNED: '已分配', IN_DESIGN: '设计中', DESIGN_REVIEW: '待设计审核', DESIGN_APPROVED: '设计已完成', COMPLETED: '设计已完成',
};
function formatTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function emptyText(view: string) {
  if (view === 'draft') return '暂无草稿，可新建法旨';
  if (view === 'returnedForSupplement') return '暂无需要补充资料的法旨';
  if (view === 'processing') return '暂无处理中法旨';
  if (view === 'designCompleted') return '暂无设计已完成的法旨';
  return '暂无符合当前筛选条件的法旨';
}

export default function OperatorDecreeList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [data, setData] = useState<any>({ items: [], total: 0, operatorScopeCounts: {} });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchText, setSearchText] = useState('');
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const filters = useMemo(() => {
    const params = new URLSearchParams(queryString);
    return {
      view: viewOptions.some(([value]) => value === params.get('view')) ? params.get('view')! : 'all',
      createdRange: params.get('createdRange') === 'thisWeek' ? 'thisWeek' : undefined,
      status: params.get('status') || undefined,
      priority: params.get('priority') || undefined,
      search: params.get('search') || '',
      page: Number(params.get('page') || 1),
      pageSize: Number(params.get('pageSize') || 20),
    };
  }, [queryString]);

  const sync = (next: Record<string, any>) => {
    const params = new URLSearchParams();
    if (next.view && next.view !== 'all') params.set('view', next.view);
    else params.set('view', 'all');
    if (next.createdRange) params.set('createdRange', next.createdRange);
    if (next.status) params.set('status', next.status);
    if (next.priority) params.set('priority', next.priority);
    if (next.search) params.set('search', next.search);
    if (next.page && next.page !== 1) params.set('page', String(next.page));
    if (next.pageSize && next.pageSize !== 20) params.set('pageSize', String(next.pageSize));
    router.replace(`/dashboard/fazhi?${params.toString()}`, { scroll: false });
  };

  const load = async () => {
    setLoading(true);
    setHasLoaded(false);
    try {
      const response = await taskApi.findAll(filters);
      setData(response.data.data || response.data);
      setSelectedIds([]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载我的法旨失败'));
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  };

  useEffect(() => { load(); }, [queryString]);
  useEffect(() => { setSearchText(filters.search); }, [filters.search]);

  useEffect(() => {
    if (loading || !hasLoaded || typeof window === 'undefined') return;
    const pathWithQuery = `${window.location.pathname}${window.location.search}`;
    let context: ListReturnContext | null = null;
    try {
      context = JSON.parse(sessionStorage.getItem(listContextKey(pathWithQuery)) || 'null');
    } catch {
      context = null;
    }
    if (!context || !Number.isFinite(context.scrollTop) || !Number.isSafeInteger(context.lastViewedTaskId)) return;

    const target = (data.items || []).find((row: any) => row.id === context!.lastViewedTaskId);
    if (target) setHighlightedId(target.id);

    const restoreFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: context!.scrollTop, behavior: 'auto' });
      window.requestAnimationFrame(() => {
        if (target && Math.abs(window.scrollY - context!.scrollTop) > 12) {
          document.getElementById(`operator-task-${target.id}`)?.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
      });
    });
    const clearTimer = window.setTimeout(() => {
      setHighlightedId(null);
      sessionStorage.removeItem(listContextKey(pathWithQuery));
    }, 2600);
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      window.clearTimeout(clearTimer);
    };
  }, [data.items, hasLoaded, loading, queryString]);

  const change = (patch: Record<string, any>) => sync({ ...filters, ...patch });
  const items = data.items || [];
  const scopeCounts = data.operatorScopeCounts || {};
  const selectedRows = items.filter((row: any) => selectedIds.includes(row.id));
  const allDrafts = selectedRows.length > 0 && selectedRows.every((row: any) => row.workflowStatus === 'DRAFT');
  const allPageDrafts = items.filter((row: any) => row.workflowStatus === 'DRAFT');
  const compatibleStatusOptions = statusOptions.filter(([value]) => {
    if (filters.view === 'draft') return value === 'DRAFT';
    if (filters.view === 'returnedForSupplement') return value === 'OPS_REJECTED';
    if (filters.view === 'designCompleted') return value === 'DESIGN_APPROVED';
    if (filters.view === 'processing') return ['SUBMITTED', 'OPS_APPROVED', 'DESIGN_ASSIGNED', 'IN_DESIGN', 'DESIGN_REVIEW'].includes(value);
    return true;
  });

  const openDetail = (id: number) => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    sessionStorage.setItem(listContextKey(returnTo), JSON.stringify({ scrollTop: window.scrollY, lastViewedTaskId: id } satisfies ListReturnContext));
    router.push(`/dashboard/fazhi/${id}?returnTo=${encodeURIComponent(returnTo)}`, { scroll: false });
  };

  const deleteDrafts = async (ids = selectedIds) => {
    const rows = items.filter((row: any) => ids.includes(row.id));
    if (!ids.length || !rows.every((row: any) => row.workflowStatus === 'DRAFT')) return;
    try {
      const response = await taskApi.batchDelete({ taskIds: ids });
      const result = response.data.data || response.data;
      message.success(`已删除 ${result.successCount} 条草稿`);
      load();
    } catch (error) { message.error(getErrorMessage(error, '删除草稿失败')); }
  };

  const download = async (row: any) => {
    const attachment = (row.imageTasks || []).flatMap((image: any) => image.attachments || [])[0];
    if (!attachment) return message.info('该法旨暂未找到可下载的设计完成稿');
    try {
      const response = await attachmentApi.download(attachment.id);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url; link.download = attachment.fileName || `${row.serialNumber}-设计完成稿`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) { message.error(getErrorMessage(error, '下载设计完成稿失败')); }
  };

  const columns: any[] = [
    ...(filters.view === 'draft' ? [{
      title: <Checkbox checked={allPageDrafts.length > 0 && allPageDrafts.every((row: any) => selectedIds.includes(row.id))} indeterminate={selectedIds.length > 0 && !allPageDrafts.every((row: any) => selectedIds.includes(row.id))} onChange={(event) => setSelectedIds(event.target.checked ? allPageDrafts.map((row: any) => row.id) : [])} />,
      width: 44,
      render: (_: any, row: any) => <Checkbox checked={selectedIds.includes(row.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, row.id] : selectedIds.filter((id) => id !== row.id))} />,
    }] : []),
    { title: '法旨编号', dataIndex: 'serialNumber', width: 150, render: (value: string, row: any) => <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(row.id)}>{value}</Button> },
    { title: '产品编号', dataIndex: 'productCode', width: 130, render: (value: string) => value || '-' },
    { title: '店铺', dataIndex: ['store', 'name'], width: 120, render: (value: string) => value || '-' },
    { title: '需求类型', dataIndex: ['requirementType', 'name'], width: 120, render: (value: string) => value || '-' },
    { title: '有效图片', width: 90, render: (_: any, row: any) => `${row._count?.imageTasks ?? 0} 张` },
    { title: '当前状态', width: 130, render: (_: any, row: any) => <SecondaryStatusTag status={row.workflowStatus} label={statusLabels[row.workflowStatus] || row.workflowStatus} /> },
    { title: '当前处理环节', width: 150, render: (_: any, row: any) => statusLabels[row.workflowStatus] || row.workflowStatus },
    { title: '优先级', dataIndex: 'priority', width: 90, render: (value: string) => <Tag color={value === 'URGENT' ? 'red' : 'default'}>{value === 'URGENT' ? '加急' : '普通'}</Tag> },
    { title: '最近更新', dataIndex: 'updatedAt', width: 135, render: formatTime },
    { title: '操作', fixed: 'right', width: 190, render: (_: any, row: any) => {
      const draft = row.workflowStatus === 'DRAFT';
      const returned = row.workflowStatus === 'OPS_REJECTED';
      const complete = ['DESIGN_APPROVED', 'COMPLETED'].includes(row.workflowStatus);
      const primaryLabel = draft ? '继续编辑' : returned ? '补充资料' : complete ? '查看成果' : row.workflowStatus === 'SUBMITTED' ? '查看详情' : '查看进度';
      const moreItems = [
        ...(draft ? [{ key: 'delete', label: '删除草稿', danger: true }] : []),
        ...(returned ? [{ key: 'reason', label: '查看退回原因' }, { key: 'resubmit', label: '重新提交' }] : []),
        ...(complete ? [{ key: 'download', label: '下载附件', icon: <DownloadOutlined /> }, { key: 'detail', label: '查看详情' }] : []),
      ];
      return <Space size={4}>
        <Button size="small" type={returned ? 'primary' : 'default'} icon={complete ? <EyeOutlined /> : undefined} onClick={() => openDetail(row.id)}>{primaryLabel}</Button>
        {moreItems.length > 0 && <Dropdown menu={{ items: moreItems, onClick: ({ key }) => {
          if (key === 'delete') {
            Modal.confirm({ title: '确认删除该草稿？', content: '删除后不可恢复。', okButtonProps: { danger: true }, onOk: () => deleteDrafts([row.id]) });
            return;
          }
          if (key === 'download') {
            download(row);
            return;
          }
          openDetail(row.id);
        } }}><Button size="small" icon={<MoreOutlined />}>更多</Button></Dropdown>}
      </Space>;
    } },
  ];

  return <SecondaryPageShell>
    <SecondaryPageHeader
      breadcrumb={<span>工作台 / 法旨</span>}
      title="我的法旨"
      subtitle="跟进我提交的法旨与设计进度。"
      meta={<span>当前角色：普通运营</span>}
      primaryAction={{ key: 'create', label: '新建法旨', icon: <PlusOutlined />, onClick: () => router.push('/dashboard/fazhi/new') }}
    />
    <FilterCard>
      <Space wrap>
        {viewOptions.map(([value, label]) => <Button key={value} type={filters.view === value && !filters.createdRange ? 'primary' : 'default'} onClick={() => change({ view: value, createdRange: undefined, status: undefined, page: 1 })}>{label} {scopeCounts[value === 'draft' ? 'drafts' : value] ?? 0}</Button>)}
      </Space>
    </FilterCard>
    <FilterCard>
      <Space wrap style={{ width: '100%' }}>
        <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} onPressEnter={() => change({ search: searchText, page: 1 })} prefix={<SearchOutlined />} placeholder="搜索法旨编号、产品编号、店铺" style={{ width: 340 }} />
        <Select allowClear value={filters.status} placeholder="当前状态" style={{ width: 180 }} onChange={(status) => change({ status, page: 1 })} options={compatibleStatusOptions.map(([value, label]) => ({ value, label }))} />
        <Select allowClear value={filters.priority} placeholder="优先级" style={{ width: 130 }} onChange={(priority) => change({ priority, page: 1 })} options={[{ value: 'URGENT', label: '加急' }, { value: 'NORMAL', label: '普通' }]} />
        <Button type="primary" onClick={() => change({ search: searchText, page: 1 })}>筛选</Button>
        <Button onClick={() => change({ view: 'all', createdRange: undefined, status: undefined, priority: undefined, search: '', page: 1 })}>重置</Button>
      </Space>
    </FilterCard>
    <DataTableCard title="法旨列表" extra={<span>共 {data.total || 0} 条法旨</span>}>
      {filters.view === 'draft' && <div style={{ marginBottom: 12 }}><Popconfirm title="仅删除当前选中的草稿，确认继续？" onConfirm={() => deleteDrafts()}><Button danger disabled={!allDrafts}>批量删除草稿</Button></Popconfirm>{selectedIds.length > 0 && !allDrafts && <span style={{ marginLeft: 8, color: '#b91c1c' }}>仅可选择草稿删除</span>}</div>}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 1450 }}
        pagination={false}
        rowClassName={(row: any) => row.id === highlightedId ? (styles.returnedTaskRow || '') : ''}
        onRow={(row: any) => ({ id: `operator-task-${row.id}` })}
        locale={{ emptyText: <SecondaryEmptyState description={emptyText(filters.view)} /> }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><Pagination current={filters.page} pageSize={filters.pageSize} total={data.total || 0} showSizeChanger showTotal={(total) => `共 ${total} 条`} onChange={(page, pageSize) => change({ page, pageSize })} /></div>
    </DataTableCard>
  </SecondaryPageShell>;
}
