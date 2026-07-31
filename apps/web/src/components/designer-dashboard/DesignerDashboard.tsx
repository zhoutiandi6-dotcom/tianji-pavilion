'use client';

import { useState } from 'react';
import { Button, Empty, Input, message, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import { imageTaskApi, getErrorMessage } from '@/lib/api';
import styles from './designer-dashboard.module.css';

type DesignerDashboardProps = {
  user: any;
  roleData?: any;
  loading?: boolean;
  error?: string | null;
  onRefresh: () => Promise<void> | void;
};

const statusLabels: Record<string, string> = {
  NOT_STARTED: '待开始',
  IN_PROGRESS: '设计中',
  REVISION_REQUIRED: '退回修改',
  SUBMITTED_FOR_REVIEW: '待审核',
  APPROVED: '已完成',
};

const activityLabels: Record<string, string> = {
  assign_designer: '设计主管已分配任务',
  start_making: '开始设计',
  upload_completed: '上传完成稿',
  submit_review: '提交设计主管审核',
  review_reject: '设计主管退回修改',
  review_approve: '设计主管审核通过',
};

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function DesignerDashboard({
  user,
  roleData,
  loading,
  error,
  onRefresh,
}: DesignerDashboardProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [startingId, setStartingId] = useState<number | null>(null);
  const designer = roleData?.designer;
  const summary = designer?.summary;
  const week = designer?.week;
  const priorityTasks = designer?.priorityTasks || [];
  const recentActivities = designer?.recentActivities || [];

  const openTasks = (status?: string) => {
    const params = new URLSearchParams({ scope: status === 'APPROVED' ? 'archived' : 'processing' });
    if (status) params.set('taskStatus', status);
    if (search.trim()) params.set('search', search.trim());
    router.push(`/dashboard/fazhi?${params.toString()}`);
  };

  const openTask = (decreeId: number) => router.push(`/dashboard/fazhi/${decreeId}`);

  const startTask = async (item: any) => {
    const imageTaskId = Number(item.imageTaskId || item.taskId);
    if (!imageTaskId) return;
    setStartingId(imageTaskId);
    try {
      await imageTaskApi.start(imageTaskId);
      message.success('已开始设计');
      window.dispatchEvent(new Event('tianji:dashboard-refresh'));
      await onRefresh();
      openTask(item.decreeId);
    } catch (err) {
      message.error(getErrorMessage(err, '开始设计失败，请稍后重试'));
    } finally {
      setStartingId(null);
    }
  };

  const actionFor = (item: any) => {
    if (item.status === 'NOT_STARTED') {
      return (
        <Button
          type="primary"
          size="small"
          loading={startingId === Number(item.imageTaskId || item.taskId)}
          onClick={() => startTask(item)}
        >
          开始设计
        </Button>
      );
    }
    if (item.status === 'IN_PROGRESS')
      return (
        <Button size="small" onClick={() => openTask(item.decreeId)}>
          继续处理
        </Button>
      );
    if (item.status === 'REVISION_REQUIRED')
      return (
        <Button size="small" onClick={() => openTask(item.decreeId)}>
          查看退回并修改
        </Button>
      );
    if (item.status === 'SUBMITTED_FOR_REVIEW')
      return (
        <Button size="small" onClick={() => openTask(item.decreeId)}>
          查看提交
        </Button>
      );
    return (
      <Button size="small" onClick={() => openTask(item.decreeId)}>
        查看详情
      </Button>
    );
  };

  const cards = [
    ['NOT_STARTED', summary?.notStartedCount || 0],
    ['IN_PROGRESS', summary?.inProgressCount || 0],
    ['REVISION_REQUIRED', summary?.revisionRequiredCount || 0],
    ['SUBMITTED_FOR_REVIEW', summary?.submittedForReviewCount || 0],
    ['APPROVED', summary?.approvedThisWeekCount || 0],
  ];

  if (loading && !designer) {
    return (
      <div className={styles.loading}>
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    );
  }

  if (!designer) {
    return (
      <div className={styles.empty}>
        <Empty description={error || '设计师工作台数据暂时无法加载'}>
          <Button onClick={() => onRefresh()}>重新加载</Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1>设计师工作台</h1>
          <p>{user?.displayName || user?.username || '设计师'} · 当前角色：设计师</p>
          <span>
            {week?.weekStart && week?.displayWeekEnd
              ? `${week.weekStart}—${week.displayWeekEnd}`
              : '周数据暂时无法加载'}{' '}
            · 聚焦分配给我的图片任务
          </span>
        </div>
        <div className={styles.headerTools}>
          <Input.Search
            aria-label="搜索我的任务"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onSearch={() => openTasks()}
            placeholder="搜索法旨、产品或店铺"
            enterButton={false}
          />
          <Button type="primary" onClick={() => openTasks()}>
            查看我的任务
          </Button>
        </div>
      </header>

      {error && (
        <div className={styles.errorNotice}>数据刷新失败，当前显示最近一次成功数据。{error}</div>
      )}

      <section className={styles.topGrid}>
        <article className={styles.darkCard}>
          <div className={styles.darkPrimary}>
            <h2>待办图片任务</h2>
            <div className={styles.darkNumber}>
              {summary?.pendingTotal || 0}
              <small>张</small>
            </div>
            <div className={styles.darkFooter}>
              <span>
                当前涉及 <b>{summary?.decreeCount || 0} 条法旨</b>
              </span>
              <span>
                已提交待审核 <b>{summary?.submittedForReviewCount || 0} 张</b>
              </span>
            </div>
          </div>
          <div className={styles.darkMetrics}>
            {cards.slice(0, 4).map(([status, count]) => (
              <button type="button" key={status} onClick={() => openTasks(status)}>
                <span>{statusLabels[status]}</span>
                <b>{count}</b>
              </button>
            ))}
          </div>
        </article>

        <article className={styles.weekCard}>
          <div className={styles.cardTitle}>
            <h2>本周个人进度</h2>
            <span>设计主管审核通过为完成口径</span>
          </div>
          {summary?.completionRate === null || summary?.completionRate === undefined ? (
            <div className={styles.noPlan}>
              <strong>尚未建立本周计划</strong>
              <span>本周审核通过数量会正常记录，计划完成率将在有效周计划建立后显示。</span>
            </div>
          ) : (
            <div className={styles.weekContent}>
              <div className={styles.weekRate}>
                <strong>{summary.completionRate}%</strong>
                <span>本周计划完成率</span>
              </div>
              <div className={styles.weekProgress}>
                <b>
                  已审核通过 {summary.approvedThisWeekCount} / 本周计划 {summary.plannedImageCount}
                </b>
                <div>
                  <i style={{ width: `${Math.min(summary.completionRate, 100)}%` }} />
                </div>
                <span>超出计划仍正常统计，不阻断任务处理。</span>
              </div>
              <div className={styles.weekDetails}>
                <span>
                  待开始 <b>{summary.notStartedCount} 张</b>
                </span>
                <span>
                  设计中 <b>{summary.inProgressCount} 张</b>
                </span>
                <span>
                  退回修改 <b>{summary.revisionRequiredCount} 张</b>
                </span>
                <Button onClick={() => openTasks()}>查看全部任务</Button>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className={styles.statusSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>任务状态</h2>
            <span>点击状态卡进入对应任务筛选</span>
          </div>
          <span className={styles.dataHint}>实时数据库数据</span>
        </div>
        <div className={styles.statusGrid}>
          {cards.map(([status, count]) => (
            <button
              type="button"
              key={status}
              className={styles.statusCard}
              onClick={() => openTasks(status)}
            >
              <span>{statusLabels[status]}</span>
              <b>
                {count}
                <small>张</small>
              </b>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.priorityCard}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>重点待办</h2>
            <span>退回修改优先，其次是设计中与新分配任务</span>
          </div>
          <button type="button" onClick={() => openTasks()}>
            查看全部 <span>›</span>
          </button>
        </div>
        {priorityTasks.length ? (
          <div className={styles.taskTable}>
            <div className={styles.taskHead}>
              <span>法旨编号</span>
              <span>店铺 / 产品编号</span>
              <span>图片任务</span>
              <span>状态</span>
              <span>退回原因摘要</span>
              <span>最近更新</span>
              <span>操作</span>
            </div>
            {priorityTasks.map((item: any) => (
              <div className={styles.taskRow} key={item.imageTaskId || item.taskId}>
                <span title={item.decreeNo}>{item.decreeNo}</span>
                <span title={`${item.storeName || '-'} / ${item.productCode || '-'}`}>
                  {item.storeName || '-'} / {item.productCode || '-'}
                </span>
                <span title={item.imageName || `图片 ${item.imageIndex}`}>
                  #{item.imageIndex} {item.imageName || `图片 ${item.imageIndex}`}
                </span>
                <span>
                  <em data-status={item.status}>{statusLabels[item.status] || item.status}</em>
                </span>
                <span title={item.latestRejectionReason || ''}>
                  {item.latestRejectionReason || '-'}
                </span>
                <span>{formatTime(item.updatedAt)}</span>
                <span>{actionFor(item)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有需要处理的图片任务" />
          </div>
        )}
      </section>

      <section className={styles.activityCard}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>最近动态</h2>
            <span>仅展示与我当前任务相关的真实操作记录</span>
          </div>
        </div>
        {recentActivities.length ? (
          <div className={styles.activityList}>
            {recentActivities.map((item: any) => (
              <button type="button" key={item.id} onClick={() => openTask(item.decreeId)}>
                <time>{formatTime(item.occurredAt)}</time>
                <strong>{activityLabels[item.type] || item.description}</strong>
                <span>
                  {item.decreeNo} · {item.imageName || '法旨任务'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无与当前任务相关的动态" />
          </div>
        )}
      </section>
    </div>
  );
}
