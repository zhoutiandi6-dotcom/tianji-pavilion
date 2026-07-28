'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Empty, Progress } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { taskApi } from '@/lib/api';
import styles from './design-manager-dashboard.module.css';

type DashboardProps = {
  data: any;
  user: any;
  roleData?: any;
};

type DashboardTask = {
  id: number;
  serialNumber: string;
  productCode?: string | null;
  store?: { name?: string | null } | null;
  requirementType?: { name?: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: { imageTasks?: number };
  imageTasks?: Array<{ status?: string; designerId?: number | null }>;
};

const cardValue = (cards: any[], imageStatus?: string) => {
  if (!imageStatus) return Number(cards[0]?.value || 0);
  const matched = cards.find((card) => String(card.target || '').includes(`imageStatus=${imageStatus}`));
  return Number(matched?.value || 0);
};

const formatTime = (value?: string) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
};

const formatWeek = (start?: string, end?: string) => {
  if (!start || !end) return '当前自然周 · 当前角色：设计主管';
  const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' });
  return `${date.format(new Date(start))}—${date.format(new Date(new Date(end).getTime() - 1))} · 当前角色：设计主管`;
};

function TrendChart({ data }: { data?: { days?: string[]; previous?: number[]; current?: number[] } }) {
  const days = data?.days || ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const previous = data?.previous || Array(days.length).fill(0);
  const current = data?.current || Array(days.length).fill(0);
  const max = Math.max(...previous, ...current, 1);
  const tickMax = Math.ceil(max / 10) * 10;
  const ticks = [tickMax, Math.round(tickMax / 2), 0];

  return (
    <article className={styles.trendCard}>
      <div className={styles.cardHeading}>
        <div>
          <h2>上周与本周实际审核通过</h2>
          <span>按天 / 单位：张</span>
        </div>
        <div className={styles.legend}><i />上周 <b />本周</div>
      </div>
      <div className={styles.chart} aria-label="审核通过趋势，数据来自数据库审核通过记录">
        <div className={styles.axis}>{ticks.map((tick) => <span key={tick}>{tick}</span>)}</div>
        <div className={styles.chartBody}>
          <div className={styles.plotArea}>
            {days.map((day, index) => (
              <div className={styles.barGroup} key={day}>
                <span title={`上周 ${previous[index] ?? 0} 张`} style={{ height: `${((previous[index] ?? 0) / tickMax) * 100}%` }} />
                <b title={`本周 ${current[index] ?? 0} 张`} style={{ height: `${((current[index] ?? 0) / tickMax) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className={styles.xAxis}>{days.map((day) => <span key={day}>{day}</span>)}</div>
        </div>
      </div>
    </article>
  );
}

function TaskList({ title, tasks, review, onOpen }: { title: string; tasks: DashboardTask[]; review?: boolean; onOpen: (task: DashboardTask) => void }) {
  return (
    <article className={styles.listCard}>
      <div className={styles.cardHeading}>
        <h2>{title}</h2>
        <button type="button" onClick={() => onOpen({ id: 0, serialNumber: '' })}>查看全部 <span>›</span></button>
      </div>
      {tasks.length ? (
        <div className={styles.taskTable}>
          <div className={review ? styles.reviewHead : styles.assignmentHead}>
            {review && <span>预览</span>}<span>法旨编号</span>{review ? <><span>图片任务</span><span>设计师</span><span>提交时间</span><span>操作</span></> : <><span>店铺</span><span>产品编号</span><span>需求类型</span><span>图片数量</span><span>审批时间</span><span>操作</span></>}
          </div>
          {tasks.slice(0, 5).map((task) => {
            const designTaskCount = task.imageTasks?.filter((item) => item.status === 'SUBMITTED_FOR_REVIEW').length || task._count?.imageTasks || 0;
            return (
              <div className={review ? styles.reviewRow : styles.assignmentRow} key={task.id}>
                {review && <button type="button" className={styles.previewIcon} aria-label={`预览 ${task.serialNumber}`} onClick={() => onOpen(task)}><EyeOutlined /></button>}
                <span title={task.serialNumber}>{task.serialNumber}</span>
                {review ? <><span>{designTaskCount ? `待审核图片 ${designTaskCount} 张` : '待审核图片'}</span><span>进入详情查看</span><span>{formatTime(task.updatedAt)}</span><button type="button" onClick={() => onOpen(task)}>去审核</button></> : <><span>{task.store?.name || '-'}</span><span>{task.productCode || '-'}</span><span>{task.requirementType?.name || '-'}</span><span>{task._count?.imageTasks || 0}</span><span>{formatTime(task.updatedAt || task.createdAt)}</span><button type="button" onClick={() => onOpen(task)}>去分配</button></>}
              </div>
            );
          })}
        </div>
      ) : <div className={styles.emptyWrap}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前暂无待处理任务" /></div>}
    </article>
  );
}

export default function DesignManagerDashboard({ data, user, roleData }: DashboardProps) {
  const router = useRouter();
  const [assignmentTasks, setAssignmentTasks] = useState<DashboardTask[]>([]);
  const [reviewTasks, setReviewTasks] = useState<DashboardTask[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      taskApi.findAll({ scope: 'design-assignment', pageSize: 5 }),
      taskApi.findAll({ scope: 'design-reviews', pageSize: 5 }),
    ]).then(([assignment, review]) => {
      if (cancelled) return;
      setAssignmentTasks((assignment.data.data || assignment.data).items || []);
      setReviewTasks((review.data.data || review.data).items || []);
    }).catch(() => {
      if (!cancelled) {
        setAssignmentTasks([]);
        setReviewTasks([]);
      }
    });
    return () => { cancelled = true; };
  }, [roleData?.refreshedAt]);

  const cards = data.cards || [];
  const plan = roleData?.weeklyPlan || data.weeklyPlan;
  const planSummary = plan?.summary;
  const planDesigners = plan?.designers || [];
  const notStarted = cardValue(cards, 'NOT_STARTED');
  const inProgress = cardValue(cards, 'IN_PROGRESS');
  const hasWeeklyPlan = Boolean(plan?.plan) || planDesigners.some((designer: any) => Boolean(designer.targetPlanId));
  const planTotal = Number(planSummary?.targetImageCount || 0);
  const assignedCount = Number(planSummary?.assignedCount || 0);
  const planDone = Number(planSummary?.completedCount || 0);
  const planRate = planSummary?.completionRate === null || planSummary?.completionRate === undefined
    ? 0
    : Math.min(100, Math.round(Number(planSummary.completionRate)));
  const today = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(new Date());

  const routeToScope = (scope: 'design-assignment' | 'design-reviews') => router.push(`/dashboard/fazhi?scope=${scope}`);
  const openTask = (task: DashboardTask) => {
    if (!task.id) return routeToScope('design-assignment');
    router.push(`/dashboard/fazhi/${task.id}`);
  };

  const unassigned = cardValue(cards, 'PENDING_ASSIGNMENT');
  const pendingReview = cardValue(cards, 'SUBMITTED_FOR_REVIEW');
  const revision = cardValue(cards, 'REVISION_REQUIRED');

  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <div>
          <h1>设计主管驾驶舱</h1>
          <p>{formatWeek(roleData?.week?.start || plan?.weekStart, roleData?.week?.end || plan?.weekEnd)}</p>
        </div>
        <div className={styles.headerTools}><span>{user?.displayName || user?.username || '设计主管'}</span><time>{today}</time></div>
      </header>

      <section className={styles.topGrid}>
        <article className={styles.darkCard}>
          <div className={styles.darkPrimary}>
            <h2>未完成图片任务</h2>
            <div className={styles.darkNumber}>{cardValue(cards)}<small>张</small></div>
            <div className={styles.darkFooter}><span>今日新增 <b>{Number(roleData?.metrics?.todayNewImageCount || 0)} 张</b></span><span>本周新增 <b>{Number(roleData?.metrics?.weekNewImageCount || 0)} 张</b></span></div>
          </div>
          <div className={styles.taskMetrics}>
            <div><span>待分配</span><b>{unassigned}</b></div>
            <div><span>待开始与制作中</span><b>{notStarted + inProgress}</b></div>
            <div><span>待审核</span><b>{pendingReview}</b></div>
            <div><span>退回修改</span><b>{revision}</b></div>
          </div>
        </article>

        <article className={styles.planCard}>
          <div className={styles.planTitle}><h2>本周任务计划</h2><span>真实周目标数据</span></div>
          {hasWeeklyPlan ? (
            <div className={styles.planContent}>
              <div className={styles.planRate}><strong>{planRate}%</strong><span>本周计划完成率</span></div>
              <div className={styles.planProgress}><b>已完成 {planDone} / 当前计划 {planTotal}</b><Progress percent={planRate} showInfo={false} strokeColor="#111" trailColor="#dedede" /><span>已分配 {assignedCount} 张 · 剩余 {Number(planSummary?.remainingCount || 0)} 张</span></div>
              <div className={styles.planDetails}><span>涉及法旨 <b>{Number(planSummary?.decreeCount || 0)} 道</b></span><span>待审核 <b>{Number(planSummary?.pendingReviewCount || 0)} 张</b></span><span>涉及设计师 <b>{Number(planSummary?.designerCount || 0)} 人</b></span><button type="button" onClick={() => router.push('/dashboard/weekly-designer-plans')}>管理本周计划</button></div>
            </div>
          ) : (
            <div className={styles.noPlan}><strong>尚未建立本周计划</strong><span>当前待分配：{unassigned} 道法旨，请在本周计划中统一安排。</span><Button onClick={() => router.push('/dashboard/weekly-designer-plans?tab=unassigned')}>管理本周计划</Button></div>
          )}
        </article>
      </section>

      <TrendChart data={roleData?.trend} />

      <article className={styles.designersCard}>
        <div className={styles.cardHeading}><div><h2>设计师本周任务进度</h2><span>{hasWeeklyPlan ? (planTotal ? '当前周已纳入法旨' : '本周计划已建立，等待纳入图片任务') : '暂未建立本周计划'}</span></div><span className={styles.dataHint}>数据来自本周计划接口</span></div>
        {planDesigners.length ? <div className={styles.designerColumns}>{planDesigners.slice(0, 4).map((designer: any) => {
          const target = Number(designer.targetImageCount || 0);
          const done = Number(designer.completedCount || 0);
          const rate = designer.completionRate === null || designer.completionRate === undefined ? null : Math.min(100, Math.round(Number(designer.completionRate)));
          return <div className={styles.designerColumn} key={designer.designerId}><div><strong>{designer.designerName}</strong><b>{rate === null ? '-' : `${rate}%`}</b></div><span>{target ? `已完成 ${done} / 当前有效图片 ${target}` : '暂未纳入本周法旨'}</span><small>{target ? `剩余 ${Number(designer.remainingCount || 0)} 张` : '暂未纳入本周法旨'}</small>{rate !== null && <Progress percent={rate} showInfo={false} strokeColor="#111" trailColor="#dfdfdd" />}</div>;
        })}</div> : <div className={styles.emptyWrap}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无在职设计师计划数据" /></div>}
      </article>

      <section className={styles.bottomGrid}>
        <TaskList title="待分配任务" tasks={assignmentTasks} onOpen={(task) => task.id ? openTask(task) : routeToScope('design-assignment')} />
        <TaskList title="待审核完成稿" tasks={reviewTasks} review onOpen={(task) => task.id ? openTask(task) : routeToScope('design-reviews')} />
      </section>
    </div>
  );
}
