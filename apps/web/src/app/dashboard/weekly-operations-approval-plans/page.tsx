'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Form, Input, InputNumber, Modal, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { LeftOutlined, RightOutlined, SettingOutlined } from '@ant-design/icons';
import Loading from '@/components/Loading';
import RoleGate from '@/components/RoleGate';
import { weeklyOperationsApprovalPlanApi } from '@/lib/api';
import { getShanghaiWeekStart } from '@/lib/shanghai-week';

const { Title, Text } = Typography;
const DAY_MS = 24 * 60 * 60 * 1000;

function displayWeek(start?: string, end?: string) {
  if (!start || !end) return '-';
  const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric' });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(new Date(end).getTime() - 1))}`;
}

function WeeklyOperationsApprovalPlansContent() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [overview, setOverview] = useState<any>(null);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const selectedWeek = useMemo(() => getShanghaiWeekStart(anchor), [anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planResult, adjustmentsResult] = await Promise.all([
        weeklyOperationsApprovalPlanApi.getOverview(selectedWeek),
        weeklyOperationsApprovalPlanApi.getAdjustments(selectedWeek),
      ]);
      setOverview(planResult.data?.data || planResult.data);
      const rawAdjustments = adjustmentsResult.data?.data || adjustmentsResult.data || [];
      setAdjustments(Array.isArray(rawAdjustments) ? rawAdjustments : rawAdjustments.items || []);
    } catch {
      message.error('审批放行计划加载失败，请刷新后重试');
    } finally {
      setLoading(false);
    }
  }, [selectedWeek]);

  useEffect(() => { void load(); }, [load]);

  const openEditor = () => {
    form.setFieldsValue({ targetImageCount: overview?.summary?.targetImageCount || 0, reason: '' });
    setEditorOpen(true);
  };

  const savePlan = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await weeklyOperationsApprovalPlanApi.saveTarget({ weekStart: selectedWeek, targetImageCount: values.targetImageCount, reason: values.reason });
      message.success('审批放行计划已保存');
      setEditorOpen(false);
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
  const completion = summary.completionRate === null || summary.completionRate === undefined ? '-' : `${summary.completionRate}%`;

  return <div style={{ maxWidth: 1380, margin: '0 auto' }}>
    <Card bordered={false} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>运营主管本周审批放行计划</Title>
          <Text type="secondary">计划目标按有效图片数量设置；完成量仅统计本周整单审批放行的真实图片任务。</Text>
          <div style={{ marginTop: 12 }}><Text strong>{displayWeek(overview?.weekStart, overview?.weekEnd)}</Text>{overview?.isHistorical && <Tag style={{ marginLeft: 8 }}>历史周只读</Tag>}</div>
        </div>
        <Space wrap>
          <Button icon={<LeftOutlined />} onClick={() => setAnchor((date) => new Date(date.getTime() - 7 * DAY_MS))}>上一周</Button>
          <Button onClick={() => setAnchor(new Date())}>当前周</Button>
          <Button icon={<RightOutlined />} iconPosition="end" onClick={() => setAnchor((date) => new Date(date.getTime() + 7 * DAY_MS))}>下一周</Button>
          {canConfigure && <Button type="primary" icon={<SettingOutlined />} onClick={openEditor}>{overview?.plan ? '调整计划' : '设置计划'}</Button>}
        </Space>
      </div>
    </Card>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
      {[
        ['本周计划', summary.targetImageCount || 0], ['已审批放行', summary.approvedImageCount || 0], ['剩余目标', summary.remainingTargetCount || 0], ['完成率', completion], ['超计划', summary.overTargetImageCount || 0], ['周中调整', `${summary.adjustmentCount || 0} 次`],
      ].map(([title, value]) => <Card key={String(title)} size="small"><Statistic title={title} value={value as any} suffix={typeof value === 'number' && title !== '完成率' && title !== '周中调整' ? '张' : undefined} /></Card>)}
    </div>

    <Card bordered={false} title="计划调整记录">
      <Table rowKey="id" loading={loading} dataSource={adjustments} pagination={{ pageSize: 20 }} columns={[
        { title: '调整时间', dataIndex: 'adjustedAt', render: (value) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) },
        { title: '原目标', dataIndex: 'previousTarget', render: (value) => `${value} 张` },
        { title: '新目标', dataIndex: 'newTarget', render: (value) => `${value} 张` },
        { title: '调整原因', dataIndex: 'reason' },
        { title: '调整人', render: (_value, row) => row.adjustedBy?.displayName || row.adjustedBy?.username || '-' },
      ]} locale={{ emptyText: <Empty description="本周暂无计划调整记录" /> }} />
    </Card>

    <Modal title={overview?.plan ? '调整审批放行计划' : '设置审批放行计划'} open={editorOpen} onCancel={() => setEditorOpen(false)} onOk={() => void savePlan()} confirmLoading={saving} okText="保存计划">
      <Form form={form} layout="vertical">
        <Form.Item label="本周预计审批放行图片数量" name="targetImageCount" rules={[{ required: true, message: '请输入计划数量' }]}><InputNumber min={0} max={999999} style={{ width: '100%' }} /></Form.Item>
        <Form.Item label="设置或调整原因" name="reason" rules={[{ required: true, whitespace: true, message: '请填写原因' }]}><Input.TextArea maxLength={300} rows={3} /></Form.Item>
      </Form>
    </Modal>
  </div>;
}

export default function WeeklyOperationsApprovalPlansPage() {
  return <RoleGate allowedRoles={['OPERATION_MANAGER', 'OWNER', 'SUPER_ADMIN']}><WeeklyOperationsApprovalPlansContent /></RoleGate>;
}
