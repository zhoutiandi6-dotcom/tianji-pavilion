'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Form, Input, InputNumber, Modal, Space, Statistic, Table, Tabs, Tag, Typography, message } from 'antd';
import { LeftOutlined, RightOutlined, SettingOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import { userApi, weeklyDesignerPlanApi } from '@/lib/api';
import Loading from '@/components/Loading';
import TaskAssignmentModal from '@/components/TaskAssignmentModal';
import { getShanghaiWeekStart } from '@/lib/shanghai-week';
import RoleGate from '@/components/RoleGate';

const { Title, Text } = Typography;
const DAY_MS = 24 * 60 * 60 * 1000;

function displayWeek(start?: string, end?: string) {
  if (!start || !end) return '-';
  const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric' });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(new Date(end).getTime() - 1))}`;
}

function WeeklyDesignerPlansContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [anchor, setAnchor] = useState(() => new Date());
  const [overview, setOverview] = useState<any>(null);
  const [unassigned, setUnassigned] = useState<any>({ items: [], total: 0, imageCount: 0 });
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [designers, setDesigners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [assignment, setAssignment] = useState<{ taskIds: number[]; mode: 'ASSIGN' | 'REASSIGN' } | null>(null);
  const [targetDesigner, setTargetDesigner] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const selectedWeek = useMemo(() => getShanghaiWeekStart(anchor), [anchor]);
  const tab = params.get('tab') === 'unassigned' ? 'unassigned' : params.get('tab') === 'adjustments' || params.get('tab') === 'changes' ? 'adjustments' : 'plan';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plan, pending, adjustmentResult, designerResult] = await Promise.all([
        weeklyDesignerPlanApi.getOverview(selectedWeek),
        weeklyDesignerPlanApi.getUnassigned(),
        weeklyDesignerPlanApi.getAdjustments(selectedWeek),
        userApi.findDesigners(),
      ]);
      setOverview(plan.data.data || plan.data);
      setUnassigned(pending.data.data || pending.data);
      setAdjustments(adjustmentResult.data.data || adjustmentResult.data || []);
      const rawDesigners = designerResult.data.data || designerResult.data || [];
      setDesigners(rawDesigners.items || rawDesigners);
    } finally {
      setLoading(false);
    }
  }, [selectedWeek]);

  useEffect(() => { void load(); }, [load]);

  const setTab = (key: string) => router.replace(`/dashboard/weekly-designer-plans?tab=${key}`);
  const openTargetEditor = (designer: any) => {
    setTargetDesigner(designer);
    form.setFieldsValue({ targetImageCount: designer.targetImageCount || 0, reason: '' });
  };
  const initialize = async () => {
    try {
      await weeklyDesignerPlanApi.initialize(selectedWeek);
      message.success('已建立本周设计师计划记录');
      await load();
    } catch {
      message.error('建立计划失败，请刷新后重试');
    }
  };
  const saveTarget = async () => {
    const values = await form.validateFields();
    if (!targetDesigner) return;
    setSaving(true);
    try {
      await weeklyDesignerPlanApi.saveTarget({ designerId: targetDesigner.designerId, weekStart: selectedWeek, targetImageCount: values.targetImageCount, reason: values.reason });
      message.success('计划目标已保存');
      setTargetDesigner(null);
      await load();
    } catch {
      message.error('保存失败，请刷新后重试');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !overview) return <Loading />;
  const summary = overview?.summary || {};
  const canConfigure = Boolean(overview?.canConfigure);
  const planStatus = overview?.plan?.status || 'NOT_CREATED';

  return <div style={{ maxWidth: 1380, margin: '0 auto' }}>
    <Card bordered={false} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>设计师本周任务计划</Title>
          <Text type="secondary">目标按自然周设置；已分配和设计完成数量由图片任务自动统计。</Text>
          <div style={{ marginTop: 12 }}><Text strong>{displayWeek(overview?.weekStart, overview?.weekEnd)}</Text><Tag style={{ marginLeft: 8 }}>{planStatus}</Tag>{overview?.isHistorical && <Tag>历史周只读</Tag>}</div>
        </div>
        <Space wrap>
          <Button icon={<LeftOutlined />} onClick={() => setAnchor((date) => new Date(date.getTime() - 7 * DAY_MS))}>上一周</Button>
          <Button onClick={() => setAnchor(new Date())}>当前周</Button>
          <Button icon={<RightOutlined />} iconPosition="end" onClick={() => setAnchor((date) => new Date(date.getTime() + 7 * DAY_MS))}>下一周</Button>
          {canConfigure && <Button icon={<SettingOutlined />} onClick={() => void initialize()}>建立计划</Button>}
        </Space>
      </div>
    </Card>

    <Tabs activeKey={tab} onChange={setTab} items={[
      {
        key: 'plan', label: '计划概览', children: <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              ['计划目标', summary.targetImageCount || 0], ['已分配图片', summary.assignedCount || 0], ['设计完成', summary.completedCount || 0], ['待审核', summary.pendingReviewCount || 0], ['剩余目标', summary.remainingTargetCount || 0], ['完成率', summary.completionRate === null || summary.completionRate === undefined ? '-' : `${summary.completionRate}%`],
            ].map(([title, value]) => <Card size="small" key={String(title)}><Statistic title={title} value={value as any} /></Card>)}
          </div>
          <Card bordered={false} title="设计师计划与实际工作量">
            <Table rowKey="designerId" loading={loading} dataSource={overview?.designers || []} pagination={false} columns={[
              { title: '设计师', dataIndex: 'designerName' },
              { title: '周目标', dataIndex: 'targetImageCount', render: (value) => `${value} 张` },
              { title: '已分配', dataIndex: 'assignedCount', render: (value) => `${value} 张` },
              { title: '设计完成', dataIndex: 'completedCount', render: (value) => `${value} 张` },
              { title: '待审核', dataIndex: 'pendingReviewCount', render: (value) => `${value} 张` },
              { title: '剩余目标', dataIndex: 'remainingTargetCount', render: (value) => `${value} 张` },
              { title: '完成率', dataIndex: 'completionRate', render: (value: any, row: any) => value === null ? '-' : <Tag color={row.isOverTarget ? 'green' : 'blue'}>{value}%{row.isOverTarget ? ' 超计划' : ''}</Tag> },
              { title: '操作', render: (_value: any, row: any) => canConfigure ? <Button size="small" onClick={() => openTargetEditor(row)}>设置目标</Button> : <Text type="secondary">只读</Text> },
            ]} locale={{ emptyText: <Empty description="暂无设计师计划" /> }} />
          </Card>
        </>,
      },
      {
        key: 'unassigned', label: `待分配法旨 ${unassigned.total || 0}`, children: <Card bordered={false} title={`待分配 ${unassigned.total || 0} 道法旨，共 ${unassigned.imageCount || 0} 张有效图片`} extra={<Button disabled={!selectedIds.length} type="primary" onClick={() => setAssignment({ taskIds: selectedIds, mode: 'ASSIGN' })}>批量分配</Button>}>
          <Table rowKey="id" loading={loading} dataSource={unassigned.items} pagination={false} rowSelection={{ selectedRowKeys: selectedIds, onChange: (ids) => setSelectedIds(ids as number[]) }} columns={[
            { title: '法旨编号', dataIndex: 'serialNumber' }, { title: '店铺', dataIndex: 'storeName' }, { title: '产品编号', dataIndex: 'productCode' }, { title: '需求类型', dataIndex: 'requirementType' }, { title: '有效图片', dataIndex: 'imageCount', render: (value) => `${value} 张` }, { title: '需求人', dataIndex: 'requesterName' },
            { title: '优先级', dataIndex: 'priority', render: (value) => <Tag color={value === 'URGENT' ? 'red' : 'default'}>{value === 'URGENT' ? '加急' : '普通'}</Tag> },
            { title: '操作', render: (_value: any, row: any) => <Space><Button type="link" onClick={() => setAssignment({ taskIds: [row.id], mode: 'ASSIGN' })}>分配</Button><Button type="link" onClick={() => router.push(`/dashboard/fazhi/${row.id}`)}>查看</Button></Space> },
          ]} locale={{ emptyText: <Empty description="暂无待分配法旨" /> }} />
        </Card>,
      },
      {
        key: 'adjustments', label: '计划调整记录', children: <Card bordered={false}><Table rowKey="id" dataSource={adjustments} loading={loading} pagination={{ pageSize: 20 }} columns={[
          { title: '时间', dataIndex: 'adjustedAt', render: (value) => new Date(value).toLocaleString('zh-CN') },
          { title: '设计师', render: (_value, row) => row.plan?.designer?.displayName || row.plan?.designer?.username || '-' },
          { title: '原目标', dataIndex: 'previousTarget', render: (value) => `${value} 张` }, { title: '新目标', dataIndex: 'newTarget', render: (value) => `${value} 张` },
          { title: '调整原因', dataIndex: 'reason' }, { title: '调整人', render: (_value, row) => row.adjustedBy?.displayName || row.adjustedBy?.username || '-' },
        ]} locale={{ emptyText: <Empty description="本周暂无计划调整" /> }} /></Card>,
      },
    ]} />

    <TaskAssignmentModal open={!!assignment} taskIds={assignment?.taskIds || []} tasks={unassigned.items || []} designers={designers} mode={assignment?.mode} onClose={() => setAssignment(null)} onSuccess={async () => { setSelectedIds([]); await load(); }} />
    <Modal title={`设置 ${targetDesigner?.designerName || ''} 的周目标`} open={!!targetDesigner} onCancel={() => setTargetDesigner(null)} onOk={() => void saveTarget()} confirmLoading={saving} okText="保存目标">
      <Form form={form} layout="vertical">
        <Form.Item label="计划完成图片数量" name="targetImageCount" rules={[{ required: true, message: '请输入计划数量' }]}><InputNumber min={0} max={9999} style={{ width: '100%' }} /></Form.Item>
        <Form.Item label="调整原因" name="reason" rules={[{ required: true, whitespace: true, message: '请填写调整原因' }]}><Input.TextArea maxLength={300} rows={3} /></Form.Item>
      </Form>
    </Modal>
  </div>;
}

export default function WeeklyDesignerPlansPage() {
  return <RoleGate allowedRoles={['DESIGN_MANAGER', 'OWNER', 'SUPER_ADMIN']}><WeeklyDesignerPlansContent /></RoleGate>;
}
