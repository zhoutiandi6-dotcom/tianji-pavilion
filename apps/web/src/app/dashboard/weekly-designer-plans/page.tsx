'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Empty, Input, Modal, Space, Statistic, Table, Tabs, Tag, Typography, message } from 'antd';
import { LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import { userApi, weeklyDesignerPlanApi } from '@/lib/api';
import Loading from '@/components/Loading';
import TaskAssignmentModal from '@/components/TaskAssignmentModal';
import { formatShanghaiDateTime, formatShanghaiWeek, getShanghaiWeekStart, shiftShanghaiWeekStart } from '@/lib/shanghai-week';
import RoleGate from '@/components/RoleGate';

const { Title, Text } = Typography;

function readChangeMetadata(value?: string) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

function WeeklyDesignerPlansContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [selectedWeek, setSelectedWeek] = useState(() => getShanghaiWeekStart());
  const [overview, setOverview] = useState<any>(null);
  const [unassigned, setUnassigned] = useState<any>({ items: [], total: 0, imageCount: 0 });
  const [changes, setChanges] = useState<any[]>([]);
  const [designers, setDesigners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [assignment, setAssignment] = useState<{ taskIds: number[]; mode: 'ASSIGN' | 'REASSIGN' } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);
  const tab = params.get('tab') === 'unassigned' ? 'unassigned' : params.get('tab') === 'changes' ? 'changes' : 'plan';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plan, pending, changeResult, designerResult] = await Promise.all([
        weeklyDesignerPlanApi.getOverview(selectedWeek),
        weeklyDesignerPlanApi.getUnassigned(),
        weeklyDesignerPlanApi.getChanges(selectedWeek),
        userApi.findDesigners(),
      ]);
      setOverview(plan.data?.data || plan.data);
      setUnassigned(pending.data?.data || pending.data);
      setChanges(changeResult.data?.data || changeResult.data || []);
      const rawDesigners = designerResult.data?.data || designerResult.data || [];
      setDesigners(rawDesigners.items || rawDesigners);
    } catch (error: any) {
      message.error(error?.response?.data?.message || '周计划加载失败，请刷新后重试');
    } finally {
      setLoading(false);
    }
  }, [selectedWeek]);

  useEffect(() => { void load(); }, [load]);
  const setTab = (key: string) => router.replace(`/dashboard/weekly-designer-plans?tab=${key}`);
  const summary = overview?.summary || {};
  const canConfigure = Boolean(overview?.canConfigure) && !overview?.isHistorical;
  const planStatus = overview?.plan?.status || 'NOT_CREATED';
  const selectedTasks = (unassigned.items || []).filter((item: any) => selectedIds.includes(item.id));
  const selectedImageCount = selectedTasks.reduce((total: number, item: any) => total + Number(item.imageCount || 0), 0);
  const taskCatalog = useMemo(() => [
    ...(unassigned.items || []),
    ...(overview?.decrees || []).map((item: any) => ({
      ...item,
      id: item.id ?? item.taskId,
      // Plan detail aggregates expose plannedImageCount; the assignment modal
      // consistently consumes imageCount for both initial assignment and reassignment.
      imageCount: item.imageCount ?? item.plannedImageCount ?? 0,
    })),
  ], [unassigned.items, overview?.decrees]);
  const candidateRows = useMemo(() => {
    const needle = candidateSearch.trim().toLowerCase();
    if (!needle) return unassigned.items || [];
    return (unassigned.items || []).filter((item: any) => [item.serialNumber, item.storeName, item.requesterName, item.productCode]
      .some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [candidateSearch, unassigned.items]);

  const openPicker = () => {
    if (!canConfigure) return message.warning(overview?.isHistorical ? '历史周计划仅可查看' : '当前账号无权调整计划');
    setSelectedIds([]);
    setCandidateSearch('');
    setPickerOpen(true);
  };
  const startAssignment = (taskIds: number[], mode: 'ASSIGN' | 'REASSIGN') => {
    if (!taskIds.length) return message.warning('请至少选择一条法旨');
    setPickerOpen(false);
    setAssignment({ taskIds, mode });
  };
  const removeDecree = async () => {
    if (!removeTarget || !removeReason.trim()) return;
    setRemoving(true);
    try {
      await weeklyDesignerPlanApi.removeDecree(removeTarget.taskId, { weekStart: selectedWeek, reason: removeReason.trim() });
      message.success('已移出本周计划，不会删除法旨或图片任务');
      setRemoveTarget(null);
      setRemoveReason('');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '移出计划失败');
    } finally { setRemoving(false); }
  };

  if (loading && !overview) return <Loading />;
  const metrics = [
    ['本周计划图片', summary.plannedImageCount || 0], ['涉及法旨', summary.decreeCount || 0], ['已分配', summary.assignedCount || 0],
    ['设计中', summary.inProgressCount || 0], ['待审核', summary.pendingReviewCount || 0], ['设计完成', summary.completedCount || 0],
    ['退回修改', summary.revisionCount || 0], ['剩余', summary.remainingCount || 0], ['完成率', summary.completionRate === null || summary.completionRate === undefined ? '未安排' : `${summary.completionRate}%`],
  ];

  return <div style={{ width: '100%' }}>
    <Card bordered={false} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>设计主管本周任务计划</Title>
          <Text type="secondary">按整条法旨分配；计划图片数由有效 WeeklyPlanItem 与图片任务自动汇总。</Text>
          <div style={{ marginTop: 12 }}><Text strong>{formatShanghaiWeek(overview?.weekStart || selectedWeek) || '周数据暂时无法加载'}</Text><Tag style={{ marginLeft: 8 }}>{planStatus}</Tag>{overview?.isHistorical && <Tag>历史周只读</Tag>}</div>
        </div>
        <Space wrap>
          <Button icon={<LeftOutlined />} onClick={() => setSelectedWeek((value) => shiftShanghaiWeekStart(value, -1))}>上一周</Button>
          <Button onClick={() => setSelectedWeek(getShanghaiWeekStart())}>当前周</Button>
          <Button icon={<RightOutlined />} iconPosition="end" onClick={() => setSelectedWeek((value) => shiftShanghaiWeekStart(value, 1))}>下一周</Button>
          <Button type={canConfigure ? 'primary' : 'default'} icon={<PlusOutlined />} onClick={canConfigure ? openPicker : () => setTab('plan')}>
            {canConfigure ? '添加法旨到本周计划' : '查看计划'}
          </Button>
        </Space>
      </div>
    </Card>

    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'plan', label: '计划概览', children: <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12, marginBottom: 16 }}>
          {metrics.map(([title, value]) => <Card size="small" key={String(title)}><Statistic title={title} value={value as string | number} suffix={typeof value === 'number' && title !== '涉及法旨' ? '张' : title === '涉及法旨' ? '条' : undefined} /></Card>)}
        </div>
        {overview?.assignmentAnomalies?.length ? <Card bordered={false} style={{ marginBottom: 16 }}><Text type="danger">检测到 {overview.assignmentAnomalies.length} 条历史负责人不一致数据。请先执行明确的整单改派后再继续计划调整。</Text></Card> : null}
        <Card bordered={false} title="设计师计划与实际工作">
          <Table rowKey="designerId" loading={loading} dataSource={overview?.designers || []} pagination={false} columns={[
            { title: '设计师', dataIndex: 'designerName' }, { title: '涉及法旨', dataIndex: 'decreeCount', render: (value) => `${value} 条` },
            { title: '计划图片', dataIndex: 'plannedImageCount', render: (value) => `${value} 张` }, { title: '已分配', dataIndex: 'assignedCount', render: (value) => `${value} 张` },
            { title: '设计完成', dataIndex: 'completedCount', render: (value) => `${value} 张` }, { title: '待审核', dataIndex: 'pendingReviewCount', render: (value) => `${value} 张` },
            { title: '剩余', dataIndex: 'remainingCount', render: (value) => `${value} 张` }, { title: '完成率', dataIndex: 'completionRate', render: (value) => value === null ? '未安排' : `${value}%` },
          ]} locale={{ emptyText: <Empty description="暂无设计师计划数据" /> }} />
        </Card>
        <Card bordered={false} title="计划法旨明细" style={{ marginTop: 16 }}>
          <Table rowKey="taskId" loading={loading} dataSource={overview?.decrees || []} pagination={{ pageSize: 10 }} columns={[
            { title: '法旨编号', dataIndex: 'serialNumber' }, { title: '店铺', dataIndex: 'storeName' }, { title: '产品编号', dataIndex: 'productCode' }, { title: '需求类型', dataIndex: 'requirementType' },
            { title: '计划图片', dataIndex: 'plannedImageCount', render: (value) => `${value} 张` }, { title: '当前设计师', dataIndex: 'designerName' }, { title: '当前状态', dataIndex: 'workflowStatus' },
            { title: '加入时间', dataIndex: 'plannedAt', render: (value) => formatShanghaiDateTime(value) || '-' },
            { title: '操作', render: (_value: unknown, row: any) => row.isAssignmentAnomaly ? <Text type="danger">负责人异常</Text> : row.isCompleted ? <Text type="secondary">已完成只读</Text> : canConfigure ? <Space size={4}><Button size="small" onClick={() => startAssignment([row.taskId], 'REASSIGN')}>调整分配</Button><Button size="small" onClick={() => setRemoveTarget(row)}>移出计划</Button></Space> : <Text type="secondary">只读</Text> },
          ]} locale={{ emptyText: <Empty description="尚未添加法旨到本周计划" /> }} />
        </Card>
      </> },
      { key: 'unassigned', label: `待分配法旨 ${unassigned.total || 0}`, children: <Card bordered={false} title={`待分配 ${unassigned.total || 0} 条法旨，共 ${unassigned.imageCount || 0} 张有效图片`} extra={<Button disabled={!selectedIds.length || !canConfigure} type="primary" onClick={() => startAssignment(selectedIds, 'ASSIGN')}>选择设计师并分配</Button>}>
        <Table rowKey="id" loading={loading} dataSource={unassigned.items} pagination={false} rowSelection={canConfigure ? { selectedRowKeys: selectedIds, onChange: (ids) => setSelectedIds(ids as number[]) } : undefined} columns={[
          { title: '法旨编号', dataIndex: 'serialNumber' }, { title: '店铺', dataIndex: 'storeName' }, { title: '产品编号', dataIndex: 'productCode' }, { title: '需求类型', dataIndex: 'requirementType' }, { title: '有效图片', dataIndex: 'imageCount', render: (value) => `${value} 张` }, { title: '运营需求人', dataIndex: 'requesterName' },
          { title: '操作', render: (_value: unknown, row: any) => <Space><Button type="link" disabled={!canConfigure} onClick={() => startAssignment([row.id], 'ASSIGN')}>添加并分配</Button><Button type="link" onClick={() => router.push(`/dashboard/fazhi/${row.id}`)}>查看</Button></Space> },
        ]} locale={{ emptyText: <Empty description="暂无可加入计划的待分配法旨" /> }} />
      </Card> },
      { key: 'changes', label: '计划调整记录', children: <Card bordered={false}><Table rowKey="id" dataSource={changes} loading={loading} pagination={{ pageSize: 20 }} columns={[
        { title: '时间', dataIndex: 'createdAt', render: (value) => formatShanghaiDateTime(value) || '-' },
        { title: '操作', dataIndex: 'action' }, { title: '法旨/图片', render: (_value, row: any) => { const meta = readChangeMetadata(row.metadata); return meta.taskIds?.join(', ') || meta.taskId || meta.imageTaskIds?.join(', ') || '-'; } },
        { title: '调整原因', render: (_value, row: any) => readChangeMetadata(row.metadata).reason || '-' }, { title: '操作人', render: (_value, row: any) => row.operator?.displayName || row.operator?.username || '-' },
      ]} locale={{ emptyText: <Empty description="暂无计划调整记录" /> }} /></Card> },
    ]} />

    <Drawer title="添加法旨到本周计划" width={900} open={pickerOpen} onClose={() => setPickerOpen(false)} extra={<Button type="primary" disabled={!selectedIds.length} onClick={() => startAssignment(selectedIds, 'ASSIGN')}>下一步：选择设计师（{selectedIds.length} 条 / {selectedImageCount} 张）</Button>}>
      <Text type="secondary">仅显示运营主管已放行、所有有效图片均待设计分配且尚未归入其他有效设计周计划的法旨。</Text>
      <Input.Search allowClear style={{ marginTop: 12 }} value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="搜索法旨编号、店铺、运营需求人或产品编号" />
      <Table style={{ marginTop: 12 }} rowKey="id" dataSource={candidateRows} rowSelection={{ selectedRowKeys: selectedIds, onChange: (ids) => setSelectedIds(ids as number[]) }} pagination={{ pageSize: 8 }} columns={[
        { title: '法旨编号', dataIndex: 'serialNumber' }, { title: '店铺', dataIndex: 'storeName' }, { title: '运营需求人', dataIndex: 'requesterName' }, { title: '产品编号', dataIndex: 'productCode' }, { title: '需求类型', dataIndex: 'requirementType' }, { title: '有效图片', dataIndex: 'imageCount', render: (value) => `${value} 张` },
      ]} locale={{ emptyText: <Empty description="暂无可加入法旨" /> }} />
    </Drawer>
    <TaskAssignmentModal open={!!assignment} taskIds={assignment?.taskIds || []} tasks={taskCatalog} designers={designers} mode={assignment?.mode} planMode onClose={() => setAssignment(null)} onSuccess={async () => { setSelectedIds([]); await load(); }} />
    <Modal title="移出本周计划" open={Boolean(removeTarget)} onCancel={() => setRemoveTarget(null)} onOk={() => void removeDecree()} confirmLoading={removing} okText="确认移出" okButtonProps={{ disabled: !removeReason.trim() }}>
      <Text type="secondary">仅移出尚未开始的本周计划安排，不会删除法旨或图片任务。</Text>
      <Input.TextArea style={{ marginTop: 12 }} rows={3} maxLength={300} value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} placeholder="请填写移出原因" />
    </Modal>
  </div>;
}

export default function WeeklyDesignerPlansPage() {
  return <RoleGate allowedRoles={['DESIGN_MANAGER', 'OWNER', 'SUPER_ADMIN']}><WeeklyDesignerPlansContent /></RoleGate>;
}
