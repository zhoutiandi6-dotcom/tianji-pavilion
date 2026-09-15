'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Drawer, Empty, Input, Modal, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import RoleGate from '@/components/RoleGate';
import { weeklyOperationsApprovalPlanApi } from '@/lib/api';
import { formatShanghaiDateTime, formatShanghaiWeek, getShanghaiWeekStart, shiftShanghaiWeekStart } from '@/lib/shanghai-week';

const { Title, Text } = Typography;
const sourceLabel: Record<string, string> = { INITIAL_PLAN: '周初计划', MIDWEEK_ADDITION: '周中追加', AUTO_ADDITION: '审批自动追加' };
const statusLabel: Record<string, string> = { SUBMITTED: '待运营主管审批', OPS_REJECTED: '运营主管退回补充', OPS_APPROVED: '待设计主管分配' };

function WeeklyOperationsApprovalPlansContent() {
  const [selectedWeek, setSelectedWeek] = useState(() => getShanghaiWeekStart());
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);
  const [moveTarget, setMoveTarget] = useState<any>(null);
  const [moveReason, setMoveReason] = useState('');
  const [moving, setMoving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await weeklyOperationsApprovalPlanApi.getOverview(selectedWeek); setOverview(result.data?.data || result.data); }
    catch { message.error('审批放行计划加载失败，请刷新后重试'); }
    finally { setLoading(false); }
  }, [selectedWeek]);
  const loadCandidates = useCallback(async () => {
    setCandidateLoading(true);
    try { const result = await weeklyOperationsApprovalPlanApi.getCandidates(selectedWeek, search || undefined); const payload = result.data?.data || result.data; setCandidates(payload.items || []); }
    catch { message.error('待加入法旨加载失败'); }
    finally { setCandidateLoading(false); }
  }, [selectedWeek, search]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (drawerOpen) void loadCandidates(); }, [drawerOpen, loadCandidates]);
  const addSelected = async () => {
    if (!selectedIds.length) return;
    setAdding(true);
    try { const result = await weeklyOperationsApprovalPlanApi.addDecrees({ weekStart: selectedWeek, decreeIds: selectedIds }); const payload = result.data?.data || result.data; message.success(`已加入 ${payload.addedDecreeCount} 条法旨，共 ${payload.addedImageCount} 张图片`); setDrawerOpen(false); await load(); }
    catch { message.error('加入计划失败，请刷新后重试'); }
    finally { setAdding(false); }
  };
  const removeItem = async () => {
    if (!removeTarget || !removeReason.trim()) return;
    setRemoving(true);
    try { await weeklyOperationsApprovalPlanApi.removeItem(removeTarget.id, removeReason); message.success('已移出本周计划，不会删除法旨'); setRemoveTarget(null); setRemoveReason(''); await load(); }
    catch { message.error('移出计划失败'); }
    finally { setRemoving(false); }
  };
  const moveItem = async () => {
    if (!moveTarget || !moveReason.trim()) return;
    const currentStart = getShanghaiWeekStart();
    const nextStart = shiftShanghaiWeekStart(currentStart, 1);
    const targetWeekStart = selectedWeek === currentStart ? nextStart : currentStart;
    setMoving(true);
    try {
      await weeklyOperationsApprovalPlanApi.moveItem(moveTarget.id, { weekStart: targetWeekStart, reason: moveReason.trim() });
      message.success('已调整计划周，审批完成后将按实际审批周冻结记录');
      setMoveTarget(null);
      setMoveReason('');
      await load();
    } catch {
      message.error('调整计划周失败，请刷新后重试');
    } finally { setMoving(false); }
  };
  if (loading && !overview) return null;
  const summary = overview?.summary || {};
  const canConfigure = Boolean(overview?.canConfigure);
  const selectedImageCount = candidates.filter((item) => selectedIds.includes(item.id)).reduce((sum, item) => sum + item.effectiveImageCount, 0);
  const items = overview?.items || [];
  const completion = summary.completionRate === null || summary.completionRate === undefined ? '未设置' : `${summary.completionRate}%`;
  return <div style={{ width: '100%' }}>
    <Card bordered={false} style={{ marginBottom: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}><div><Title level={3} style={{ margin: 0 }}>运营主管本周审批放行计划</Title><Text type="secondary">按整条法旨制定计划，图片总数由法旨加入计划时的有效图片快照自动汇总。</Text><div style={{ marginTop: 12 }}><Text strong>{formatShanghaiWeek(overview?.weekStart || selectedWeek) || '周数据暂时无法加载'}</Text>{overview?.isHistorical && <Tag style={{ marginLeft: 8 }}>历史周只读</Tag>}</div></div><Space wrap><Button icon={<LeftOutlined />} onClick={() => setSelectedWeek((value) => shiftShanghaiWeekStart(value, -1) || value)}>上一周</Button><Button onClick={() => setSelectedWeek(getShanghaiWeekStart() || selectedWeek)}>当前周</Button><Button icon={<RightOutlined />} iconPosition="end" onClick={() => setSelectedWeek((value) => shiftShanghaiWeekStart(value, 1) || value)}>下一周</Button>{canConfigure && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSelectedIds([]); setSearch(''); setDrawerOpen(true); }}>添加法旨到本周计划</Button>}</Space></div></Card>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>{[['本周计划图片', summary.plannedImageCount || 0], ['涉及法旨', summary.plannedDecreeCount || 0], ['已审批放行', summary.approvedImageCount || 0], ['待审批图片', summary.pendingImageCount || 0], ['退回补充图片', summary.returnedImageCount || 0], ['已取消图片', summary.cancelledImageCount || 0], ['完成率', completion]].map(([title, value]) => <Card key={String(title)} size="small"><Statistic title={title} value={value as string | number} suffix={typeof value === 'number' ? (title === '涉及法旨' ? '条' : '张') : undefined} /></Card>)}</div>
    <Card bordered={false} title="计划法旨明细" extra={<Text type="secondary">周初计划 {summary.initialPlanImageCount || 0} 张 · 周中追加 {summary.midweekAdditionImageCount || 0} 张 · 自动追加 {summary.autoAdditionImageCount || 0} 张</Text>}><Table<any> rowKey="id" loading={loading} dataSource={items} pagination={{ pageSize: 10 }} locale={{ emptyText: <Empty description="尚未添加法旨到本周计划" /> }} columns={[{ title: '法旨编号', dataIndex: 'serialNumber' }, { title: '店铺', dataIndex: 'storeName' }, { title: '运营需求人', dataIndex: 'requester' }, { title: '产品编号', dataIndex: 'productCode' }, { title: '有效图片', dataIndex: 'plannedImageCountSnapshot', render: (value) => `${value} 张` }, { title: '加入类型', dataIndex: 'sourceType', render: (value) => sourceLabel[value] || value }, { title: '加入时间', dataIndex: 'addedAt', render: (value) => formatShanghaiDateTime(value) || '-' }, { title: '当前审批状态', dataIndex: 'workflowStatus', render: (value) => statusLabel[value] || value }, { title: '审批时间', dataIndex: 'approvedAt', render: (value) => formatShanghaiDateTime(value) || '-' }, { title: '操作', render: (_value: unknown, row: any) => row.removedAt ? <Text type="secondary">已移出</Text> : row.approvedAt ? <Text type="secondary">已放行，计划周已冻结</Text> : canConfigure ? <Space size={4}><Button size="small" onClick={() => setMoveTarget(row)}>{selectedWeek === getShanghaiWeekStart(new Date()) ? '移至下周' : '移回本周'}</Button><Button size="small" onClick={() => setRemoveTarget(row)}>移出</Button></Space> : '-' }]} /></Card>
    <Drawer title="添加法旨到本周计划" width={900} open={drawerOpen} onClose={() => setDrawerOpen(false)} extra={<Button type="primary" disabled={!selectedIds.length} loading={adding} onClick={() => void addSelected()}>确认加入（{selectedIds.length} 条 / {selectedImageCount} 张）</Button>}><Space direction="vertical" size={12} style={{ width: '100%' }}><Input.Search placeholder="搜索法旨编号、店铺、运营需求人、产品编号" value={search} onChange={(event) => setSearch(event.target.value)} onSearch={() => void loadCandidates()} allowClear /><Text type="secondary">仅显示已通过运营主管审批且未加入任何有效周计划的法旨。</Text><Table rowKey="id" loading={candidateLoading} dataSource={candidates} rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as number[]) }} pagination={{ pageSize: 8 }} columns={[{ title: '法旨编号', dataIndex: 'serialNumber' }, { title: '店铺', dataIndex: 'storeName' }, { title: '运营需求人', dataIndex: 'requester' }, { title: '产品编号', dataIndex: 'productCode' }, { title: '需求类型', dataIndex: 'requirementType' }, { title: '有效图片', dataIndex: 'effectiveImageCount', render: (value) => `${value} 张` }, { title: '首次提交', dataIndex: 'firstSubmittedAt', render: (value) => value ? new Date(value).toLocaleString('zh-CN') : '-' }, { title: '最近提交', dataIndex: 'latestSubmittedAt', render: (value) => value ? new Date(value).toLocaleString('zh-CN') : '-' }, { title: '提交类型', dataIndex: 'submissionType', render: (value) => value === 'RESUBMIT' ? '退回后重提' : '首次提交' }]} /></Space></Drawer>
    <Modal title="移出本周计划" open={Boolean(removeTarget)} onCancel={() => setRemoveTarget(null)} onOk={() => void removeItem()} confirmLoading={removing} okButtonProps={{ disabled: !removeReason.trim() }} okText="确认移出"><Text type="secondary">仅取消本周计划安排，不会删除图片任务或法旨。</Text><Input.TextArea style={{ marginTop: 12 }} rows={3} maxLength={300} value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} placeholder="请填写移出原因" /></Modal>
    <Modal title={selectedWeek === getShanghaiWeekStart(new Date()) ? '移至下周计划' : '移回本周计划'} open={Boolean(moveTarget)} onCancel={() => setMoveTarget(null)} onOk={() => void moveItem()} confirmLoading={moving} okButtonProps={{ disabled: !moveReason.trim() }} okText="确认调整"><Text type="secondary">仅待审批法旨允许调整计划周。审批完成后按实际审批时间归属完成周，不能事后调整。</Text><Input.TextArea style={{ marginTop: 12 }} rows={3} maxLength={300} value={moveReason} onChange={(event) => setMoveReason(event.target.value)} placeholder="请填写调整原因" /></Modal>
  </div>;
}
export default function WeeklyOperationsApprovalPlansPage() { return <RoleGate allowedRoles={['OPERATION_MANAGER', 'OWNER', 'SUPER_ADMIN']}><WeeklyOperationsApprovalPlansContent /></RoleGate>; }
