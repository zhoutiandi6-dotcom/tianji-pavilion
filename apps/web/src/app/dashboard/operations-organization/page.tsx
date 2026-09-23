'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Modal, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { authApi, getErrorMessage, operationsOrganizationApi } from '@/lib/api';
import { displayUserName } from '@/lib/display';

const { Title, Text } = Typography;
const userName = (user: any) => displayUserName(user) || user?.username || `用户 #${user?.id}`;

export default function OperationsOrganizationPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ type: string; group?: any; member?: any } | null>(null);
  const [form] = Form.useForm();

  const admin = ['OWNER', 'SUPER_ADMIN'].includes(currentUser?.role);
  const manager = currentUser?.role === 'OPERATION_MANAGER';
  const title = admin ? '运营组织管理' : manager ? '运营组织' : '本组成员';
  const load = async () => {
    setLoading(true);
    try {
      const [me, groupResult] = await Promise.all([authApi.getMe(), operationsOrganizationApi.groups()]);
      const identity = me.data.data || me.data;
      setCurrentUser(identity);
      setGroups(groupResult.data.data || groupResult.data || []);
      if (['OWNER', 'SUPER_ADMIN', 'OPERATION_MANAGER'].includes(identity.role)) {
        const result = await operationsOrganizationApi.unassigned();
        setUnassigned(result.data.data || result.data || []);
      } else setUnassigned([]);
      if (['OWNER', 'SUPER_ADMIN'].includes(identity.role)) {
        const result = await operationsOrganizationApi.audit();
        setAudit(result.data.data || result.data || []);
      } else setAudit([]);
    } catch (error) { message.error(getErrorMessage(error, '加载运营组织失败')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const active = groups.filter((group) => group.status === 'ACTIVE');
  const members = groups.flatMap((group) => group.memberships || []);
  const withoutLeader = active.filter((group) => !group.leader);
  const open = (type: string, group?: any, member?: any) => { form.resetFields(); setDialog({ type, group, member }); };
  const submit = async () => {
    if (!dialog) return;
    const values = await form.validateFields();
    try {
      if (dialog.type === 'create') await operationsOrganizationApi.createGroup(values.name);
      if (dialog.type === 'rename') await operationsOrganizationApi.renameGroup(dialog.group.id, values.name);
      if (dialog.type === 'assign') await operationsOrganizationApi.assign(values.userId, dialog.group.id, values.reason);
      if (dialog.type === 'move') await operationsOrganizationApi.move(dialog.member.userId, values.groupId, values.reason);
      if (dialog.type === 'end') await operationsOrganizationApi.end(dialog.member.userId, values.reason);
      if (dialog.type === 'appoint') await operationsOrganizationApi.appoint(dialog.group.id, values.userId, values.reason);
      if (dialog.type === 'replace') await operationsOrganizationApi.replace(dialog.group.id, values.userId, values.keepPreviousMember !== false, values.reason);
      if (dialog.type === 'revoke') await operationsOrganizationApi.revoke(dialog.group.id, values.reason);
      if (dialog.type === 'deactivate') await operationsOrganizationApi.deactivateGroup(dialog.group.id);
      message.success('组织配置已保存，历史关系已保留'); setDialog(null); load();
    } catch (error) { message.error(getErrorMessage(error)); }
  };
  const runReadiness = async () => {
    try {
      const result = await operationsOrganizationApi.readiness();
      setReadiness(result.data.data || result.data);
      message.success('Readiness / Dry Run 已完成（只读）');
    } catch (error) { message.error(getErrorMessage(error, 'Readiness 检查失败')); }
  };
  const candidateMembers = useMemo(() => (dialog?.group?.memberships || []).filter((item: any) => item.memberRole === 'MEMBER'), [dialog]);
  const dialogTitles: Record<string, string> = { create: '创建运营组', rename: '修改组名称', assign: '加入运营组', move: '确认调组', end: '确认离组', appoint: '任命运营组长', replace: '确认更换组长', revoke: '确认撤销组长', deactivate: '确认停用运营组' };
  const dialogOk: Record<string, string> = { move: '确认调组', replace: '确认更换', revoke: '确认撤销', deactivate: '确认停用' };
  const columns = [
    { title: '组名', dataIndex: 'name', render: (name: string, group: any) => <Space><Text strong>{name}</Text>{group.status === 'INACTIVE' && <Tag>已停用</Tag>}</Space> },
    { title: '当前组长', render: (_: any, group: any) => group.leader ? userName(group.leader.user) : <Tag color="warning">无组长</Tag> },
    { title: '成员数', dataIndex: 'memberCount', width: 90 },
    { title: '状态', dataIndex: 'status', width: 90, render: (status: string) => <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>{status === 'ACTIVE' ? '有效' : '已停用'}</Tag> },
    { title: '操作', width: admin ? 420 : 100, render: (_: any, group: any) => admin ? <Space wrap>
      <Button size="small" onClick={() => open('rename', group)}>编辑名称</Button>
      {group.status === 'ACTIVE' && <><Button size="small" onClick={() => open('assign', group)}>加入成员</Button><Button size="small" onClick={() => open(group.leader ? 'replace' : 'appoint', group)}>{group.leader ? '更换组长' : '任命组长'}</Button>{group.leader && <Button size="small" danger onClick={() => open('revoke', group)}>撤销组长</Button>}<Button size="small" danger onClick={() => open('deactivate', group)}>停用</Button></>}
    </Space> : <Text type="secondary">只读</Text> },
  ];
  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><div><Title level={4} style={{ margin: 0 }}>{title}</Title><Text type="secondary">运营主管、运营组与成员关系均由当前有效 Membership 推导。</Text></div>{admin && <Button type="primary" icon={<PlusOutlined />} onClick={() => open('create')}>创建运营组</Button>}</div>
    {withoutLeader.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={`有 ${withoutLeader.length} 个有效运营组无组长`} description="该运营组当前无组长，组内新提交法旨将无法进入常规组长审批。" />}
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}><Col xs={12} md={6}><Card><Statistic title="有效运营组" value={active.length} prefix={<TeamOutlined />} /></Card></Col><Col xs={12} md={6}><Card><Statistic title="当前运营人数" value={members.length} /></Card></Col><Col xs={12} md={6}><Card><Statistic title="未分组运营" value={unassigned.length} /></Card></Col><Col xs={12} md={6}><Card><Statistic title="无组长运营组" value={withoutLeader.length} valueStyle={{ color: withoutLeader.length ? '#d46b08' : undefined }} /></Card></Col></Row>
    <Card title="运营组"><Table rowKey="id" loading={loading} columns={columns as any} dataSource={groups} pagination={false} expandable={{ expandedRowRender: (group: any) => <Table size="small" rowKey="id" pagination={false} dataSource={group.memberships || []} columns={[{ title: '成员', render: (_: any, member: any) => userName(member.user) }, { title: '身份', dataIndex: 'memberRole', render: (role: string) => <Tag color={role === 'GROUP_LEADER' ? 'blue' : 'default'}>{role === 'GROUP_LEADER' ? '运营组长' : '普通运营'}</Tag> }, ...(admin ? [{ title: '操作', render: (_: any, member: any) => member.memberRole === 'MEMBER' ? <Space><Button size="small" onClick={() => open('move', group, member)}>调组</Button><Button size="small" danger onClick={() => open('end', group, member)}>离组</Button></Space> : <Text type="secondary">请先撤销或更换组长</Text> }] : [])] as any} /> }} /></Card>
    {admin && <Card style={{ marginTop: 16 }} title="未分组运营"><Table rowKey="id" size="small" pagination={false} dataSource={unassigned} columns={[{ title: '运营人员', render: (_: any, user: any) => userName(user) }, { title: '操作', render: (_: any, user: any) => <Select placeholder="选择加入运营组" style={{ minWidth: 190 }} options={active.map((group) => ({ value: group.id, label: group.name }))} onChange={(groupId) => operationsOrganizationApi.assign(user.id, groupId).then(() => { message.success('已加入运营组'); load(); }).catch((error) => message.error(getErrorMessage(error)))} /> }]} /></Card>}
    {admin && <Card style={{ marginTop: 16 }} title="组织配置 Readiness / Dry Run" extra={<Button onClick={runReadiness}>执行只读检查</Button>}><Text type="secondary">仅读取当前连接的数据源；不会创建运营组、Membership 或修改 strict 开关。</Text>{readiness && <Row gutter={[16, 12]} style={{ marginTop: 16 }}><Col span={8}>运营用户：{readiness.operationUserCount}</Col><Col span={8}>未分组：{readiness.unassignedOperationCount}</Col><Col span={8}>组长：{readiness.groupLeaderCount}</Col><Col span={8}>无组长组：{readiness.groupsWithoutLeader?.length || 0}</Col><Col span={8}>重复 Membership：{readiness.duplicateActiveMemberships?.length || 0}</Col><Col span={8}>重复组长：{readiness.duplicateActiveLeaders?.length || 0}</Col><Col span={24}><Tag color={readiness.strictReady ? 'green' : 'orange'}>{readiness.strictReady ? '数据条件满足 strict（仍需人工门禁）' : '尚不满足 strict 数据条件'}</Tag><Text type="secondary"> 当前模式：{readiness.mode}</Text></Col></Row>}</Card>}
    {admin && <Card style={{ marginTop: 16 }} title="组织操作审计"><Table rowKey="id" size="small" pagination={{ pageSize: 10 }} dataSource={audit} columns={[{ title: '时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString('zh-CN') }, { title: '动作', dataIndex: 'action' }, { title: '操作者 ID', dataIndex: 'operatorId' }, { title: '关联组织 / 成员', render: (_: any, item: any) => { const data = item.metadata || {}; return `组 ${data.groupId ?? '-'} / 用户 ${data.userId ?? '-'}`; } }]} /></Card>}
    <Modal destroyOnClose open={!!dialog} title={dialog ? dialogTitles[dialog.type] : ''} onCancel={() => setDialog(null)} onOk={submit} okText={dialog ? (dialogOk[dialog.type] || '确认') : '确认'} cancelText="取消">
      {dialog?.type === 'deactivate' ? <Alert type="warning" showIcon message="请先处理当前组成员和组长后再停用运营组。" description="系统不会自动结束任何 Membership。" /> : <Form form={form} layout="vertical" initialValues={dialog?.type === 'rename' ? { name: dialog.group.name } : { keepPreviousMember: true }}>
        {['create', 'rename'].includes(dialog?.type || '') && <Form.Item name="name" label="运营组名称" rules={[{ required: true, whitespace: true, message: '请输入运营组名称' }, { max: 80, message: '最多 80 个字符' }]}><Input autoFocus /></Form.Item>}
        {dialog?.type === 'assign' && <><Form.Item name="userId" label="未分组运营" rules={[{ required: true }]}><Select options={unassigned.map((user) => ({ value: user.id, label: userName(user) }))} /></Form.Item><Form.Item name="reason" label="备注"><Input /></Form.Item></>}
        {dialog?.type === 'move' && <><Text>将 {userName(dialog.member.user)} 调整至新运营组；原 Membership 会结束并保留历史。</Text><Form.Item name="groupId" label="目标运营组" rules={[{ required: true, message: '请选择目标组' }]} style={{ marginTop: 16 }}><Select options={active.filter((group) => group.id !== dialog.group.id).map((group) => ({ value: group.id, label: group.name }))} /></Form.Item><Form.Item name="reason" label="调组原因" rules={[{ required: true, whitespace: true, message: '请填写调组原因' }]}><Input.TextArea /></Form.Item></>}
        {dialog?.type === 'end' && <><Text>结束后该运营将成为未分组运营，历史 Membership 不会删除。</Text><Form.Item name="reason" label="离组原因" rules={[{ required: true, whitespace: true, message: '请填写离组原因' }]} style={{ marginTop: 16 }}><Input.TextArea /></Form.Item></>}
        {['appoint', 'replace'].includes(dialog?.type || '') && <><Form.Item name="userId" label={dialog?.type === 'replace' ? '新组长' : '任命对象'} rules={[{ required: true, message: '请选择当前组成员' }]}><Select options={candidateMembers.map((member: any) => ({ value: member.userId, label: userName(member.user) }))} /></Form.Item>{dialog?.type === 'replace' && <Form.Item name="keepPreviousMember" label="原组长处理"><Select options={[{ value: true, label: '保留为本组普通成员' }, { value: false, label: '原组长离组' }]} /></Form.Item>}<Form.Item name="reason" label="原因"><Input.TextArea /></Form.Item></>}
        {dialog?.type === 'revoke' && <><Text>撤销后原组长将保留为普通成员，运营组可暂时无组长。</Text><Form.Item name="reason" label="撤销原因" style={{ marginTop: 16 }}><Input.TextArea /></Form.Item></>}
      </Form>}
    </Modal>
  </div>;
}
