'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer, Progress, Tag, message } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { DashboardTrendChart } from '@/components/dashboard-workbench/TrendChart';
import styles from '@/components/design-manager-dashboard/design-manager-dashboard.module.css';
import { getErrorMessage, taskApi, weeklyOperationsApprovalPlanApi } from '@/lib/api';
import {
  EXCEPTION_TASKS,
  OPERATION_MANAGER_DASHBOARD_META,
  OPERATION_MANAGER_TREND,
  OPERATION_QUALITY,
} from './mock-data';

type OpsApprovalQueueItem = {
  id: number;
  serialNumber: string;
  store?: { name?: string | null } | null;
  requester: string;
  productCode: string;
  effectiveImageCount: number;
  latestSubmittedAt: string;
  waitingHours: number;
  submissionType: 'INITIAL' | 'RESUBMIT';
};

type QueueSummary = {
  pendingTaskCount: number;
  pendingImageCount: number;
  initialCount: number;
  resubmitCount: number;
  overdueCount: number;
  dataIssueCount: number;
};

type ApprovalPlanOverview = {
  plan: { id: number; targetImageCount: number } | null;
  summary: {
    targetImageCount: number;
    approvedImageCount: number;
    remainingTargetCount: number;
    completionRate: number | null;
    overTargetImageCount: number;
    adjustmentCount: number;
    increasedTargetImageCount: number;
    decreasedTargetImageCount: number;
  };
};

type OperationManagerDashboardProps = {
  user: { displayName?: string | null; username?: string | null; role?: string };
};

const EMPTY_QUEUE_SUMMARY: QueueSummary = {
  pendingTaskCount: 0,
  pendingImageCount: 0,
  initialCount: 0,
  resubmitCount: 0,
  overdueCount: 0,
  dataIssueCount: 0,
};

const formatDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
  : '-';

const submissionLabel = (type: OpsApprovalQueueItem['submissionType']) => type === 'RESUBMIT' ? '退回后重提' : '首次提交';
const rateFor = (firstPass: number, submitted: number) => submitted ? Math.round((firstPass / submitted) * 100) : 0;

export default function OperationManagerDashboard({ user }: OperationManagerDashboardProps) {
  const router = useRouter();
  const [pendingDecrees, setPendingDecrees] = useState<OpsApprovalQueueItem[]>([]);
  const [queueSummary, setQueueSummary] = useState<QueueSummary>(EMPTY_QUEUE_SUMMARY);
  const [queueLoading, setQueueLoading] = useState(true);
  const [approvalPlan, setApprovalPlan] = useState<ApprovalPlanOverview | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [personTarget, setPersonTarget] = useState<(typeof OPERATION_QUALITY)[number] | null>(null);

  const loadQueue = async () => {
    setQueueLoading(true);
    try {
      const response = await taskApi.findOpsApprovalQueue({ page: 1, pageSize: 5 });
      const payload = response.data?.data || response.data;
      setPendingDecrees(payload.items || []);
      setQueueSummary(payload.summary || EMPTY_QUEUE_SUMMARY);
    } catch (error) {
      message.error(getErrorMessage(error, '待审批法旨加载失败'));
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => { void loadQueue(); }, []);

  useEffect(() => {
    const loadPlan = async () => {
      setPlanLoading(true);
      try {
        const response = await weeklyOperationsApprovalPlanApi.getOverview();
        setApprovalPlan(response.data?.data || response.data);
      } catch (error) {
        message.error(getErrorMessage(error, '本周审批放行计划加载失败'));
      } finally {
        setPlanLoading(false);
      }
    };
    void loadPlan();
  }, []);

  const planSummary = approvalPlan?.summary;
  const approvedCount = planSummary?.approvedImageCount || 0;
  const targetCount = planSummary?.targetImageCount || 0;
  const remaining = planSummary?.remainingTargetCount || 0;
  const completionRate = planSummary?.completionRate;
  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <div>
          <h1>运营主管驾驶舱</h1>
          <p>{OPERATION_MANAGER_DASHBOARD_META.weekLabel} · 当前角色：运营主管</p>
        </div>
        <div className={styles.headerTools}>
          <span>{user.displayName || user.username || '运营主管'} · {OPERATION_MANAGER_DASHBOARD_META.sourceLabel}</span>
          <time>{OPERATION_MANAGER_DASHBOARD_META.dateLabel}</time>
        </div>
      </header>

      <section className={styles.topGrid}>
        <article className={styles.darkCard}>
          <div className={styles.darkPrimary}>
            <h2>待审批放行</h2>
            <div className={styles.darkNumber}>{queueSummary.pendingImageCount}<small>张</small></div>
            <span style={{ marginTop: 8, color: '#c9c9c9', fontSize: 13 }}>涉及法旨 {queueSummary.pendingTaskCount} 条</span>
            <div className={styles.darkFooter}><span>今日新增 <b>8 张</b></span><span>本周新增 <b>36 张</b></span></div>
          </div>
          <div className={styles.taskMetrics}>
            <div><span>首次提交</span><b>{queueSummary.initialCount}</b></div>
            <div><span>退回后重提</span><b>{queueSummary.resubmitCount}</b></div>
            <div><span>等待超过24小时</span><b>{queueSummary.overdueCount}</b></div>
            <div><span>资料异常</span><b>{queueSummary.dataIssueCount}</b></div>
          </div>
        </article>

        <article className={styles.planCard}>
          <div className={styles.planTitle}><h2>本周审批放行计划</h2><span>{planLoading ? '正在加载真实数据' : '真实数据'}</span></div>
          {!planLoading && !approvalPlan?.plan ? <div className={styles.noPlan}><strong>尚未设置本周计划</strong><span>可先设置本周预计审批放行的有效图片数量。</span><button type="button" onClick={() => router.push('/dashboard/weekly-operations-approval-plans')}>设置本周计划</button></div> : <div className={styles.planContent}>
            <div className={styles.planRate}><strong>{completionRate === null || completionRate === undefined ? '未设置' : `${completionRate}%`}</strong><span>本周审批放行完成率</span></div>
            <div className={styles.planProgress}><b>已审批放行 {approvedCount} / 本周计划 {targetCount}</b><Progress percent={Math.min(completionRate || 0, 100)} showInfo={false} strokeColor="#111" trailColor="#dedede" /><span>剩余目标 {remaining} 张{(planSummary?.overTargetImageCount || 0) > 0 ? ` · 超计划 ${planSummary?.overTargetImageCount} 张` : ''}</span></div>
            <div className={styles.planDetails}><span>计划调整 <b>{planSummary?.adjustmentCount || 0} 次</b></span><span>上调目标 <b>{planSummary?.increasedTargetImageCount || 0} 张</b></span><span>下调目标 <b>{planSummary?.decreasedTargetImageCount || 0} 张</b></span><button type="button" onClick={() => router.push('/dashboard/weekly-operations-approval-plans')}>管理本周计划</button></div>
          </div>}
        </article>
      </section>

      <DashboardTrendChart title="上周与本周实际审批放行" unitLabel="按天 / 单位：张" previousLabel="上周" currentLabel="本周" data={OPERATION_MANAGER_TREND} />

      <article className={styles.designersCard}>
        <div className={styles.cardHeading}><div><h2>运营人员需求质量</h2><span>一次通过率仅用于质量跟进，不作绩效排名。</span></div><span className={styles.dataHint}>模拟数据 / 待接真实聚合接口</span></div>
        <div className={styles.designerColumns}>{OPERATION_QUALITY.map((person) => {
          const rate = rateFor(person.firstPass, person.submitted);
          return <button key={person.id} type="button" className={styles.designerColumn} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setPersonTarget(person)}>
            <div><strong>{person.name}</strong><b>{rate}%</b></div>
            <span>本周提交 {person.submitted} 张 · 一次通过 {person.firstPass} 张</span>
            <small>被退回 {person.returned} 张 · 待补充 {person.pending} 张</small>
            <Progress percent={rate} showInfo={false} strokeColor="#111" trailColor="#dfdfdd" />
          </button>;
        })}</div>
      </article>

      <section className={styles.bottomGrid}>
        <article className={styles.listCard}>
          <div className={styles.cardHeading}><h2>待审批法旨</h2><button type="button" onClick={() => router.push('/dashboard/fazhi?scope=ops-approvals')}>查看全部 <span>→</span></button></div>
          <div className={styles.taskTable}>
            <div className={styles.assignmentHead}><span>法旨编号</span><span>店铺</span><span>运营需求人</span><span>产品编号</span><span>有效图片</span><span>最近提交</span><span>操作</span></div>
            {queueLoading && <div className={styles.assignmentRow}><span style={{ gridColumn: '1 / -1' }}>正在加载真实待审批数据…</span></div>}
            {!queueLoading && pendingDecrees.map((item) => <div className={styles.assignmentRow} key={item.id}>
              <span>{item.serialNumber}</span><span>{item.store?.name || '-'}</span><span>{item.requester}</span><span>{item.productCode}</span><span>{item.effectiveImageCount} 张</span><span>{formatDateTime(item.latestSubmittedAt)}<small style={{ display: 'block' }}>{submissionLabel(item.submissionType)} · 等待 {item.waitingHours} 小时</small></span><span style={{ display: 'flex', gap: 6 }}><button type="button" aria-label={`预览 ${item.serialNumber}`} onClick={() => router.push(`/dashboard/fazhi/${item.id}`)}><EyeOutlined /></button><button type="button" onClick={() => router.push(`/dashboard/fazhi/${item.id}`)}>去审批</button></span>
            </div>)}
            {!queueLoading && !pendingDecrees.length && <div className={styles.assignmentRow}><span style={{ gridColumn: '1 / -1' }}>暂无待运营主管审批的法旨</span></div>}
          </div>
        </article>

        <article className={styles.listCard}>
          <div className={styles.cardHeading}><h2>异常与退回任务</h2><button type="button" onClick={() => router.push('/dashboard/fazhi?scope=approval-history')}>查看全部 <span>→</span></button></div>
          <div className={styles.taskTable}>
            <div className={styles.reviewHead}><span>状态</span><span>法旨编号</span><span>问题摘要</span><span>运营需求人</span><span>退回 / 等待</span><span>操作</span></div>
            {EXCEPTION_TASKS.map((item) => <div className={styles.reviewRow} key={item.id}>
              <Tag>Mock</Tag><span>{item.serialNumber}</span><span>{item.summary}</span><span>{item.requester}</span><span>{item.status}</span><button type="button" onClick={() => message.info('模拟数据：异常与退回任务尚未接入真实列表')}>查看</button>
            </div>)}
          </div>
        </article>
      </section>

      <Drawer title="运营人员本周法旨摘要（预览）" width={420} open={Boolean(personTarget)} onClose={() => setPersonTarget(null)}>
        {personTarget && <><p><strong>{personTarget.name}</strong></p><p>本周提交图片：{personTarget.submitted} 张</p><p>一次通过图片：{personTarget.firstPass} 张</p><p>被退回图片：{personTarget.returned} 张</p><p>待补充图片：{personTarget.pending} 张</p><p>一次通过率：{rateFor(personTarget.firstPass, personTarget.submitted)}%</p></>}
      </Drawer>
    </div>
  );
}
