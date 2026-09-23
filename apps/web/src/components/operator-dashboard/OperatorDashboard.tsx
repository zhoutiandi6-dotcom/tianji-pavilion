'use client';

import { useState } from 'react';
import { Button, Empty, Input, Progress, Skeleton, Tag, message } from 'antd';
import { DownloadOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { attachmentApi, getErrorMessage } from '@/lib/api';
import styles from './operator-dashboard.module.css';

type OperatorDashboardProps = {
  user: any;
  roleData?: any;
  loading?: boolean;
  error?: string | null;
  onRefresh: () => Promise<void> | void;
};

const progressTone: Record<string, string> = {
  '待运营主管审批': 'default',
  '退回补充': 'error',
  '待设计分配': 'processing',
  '已分配': 'processing',
  '设计中': 'processing',
  '待设计审核': 'warning',
  '设计修改中': 'error',
  '设计已完成': 'success',
  '草稿': 'default',
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

export default function OperatorDashboard({ user, roleData, loading, error, onRefresh }: OperatorDashboardProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const operator = roleData?.operator;
  const summary = operator?.summary;
  const overview = operator?.weekOverview;
  const progressRows = operator?.decreeProgress || [];
  const completedRows = operator?.completedDecrees || [];
  const returnedRows = operator?.returnedDecrees || [];
  const activities = operator?.recentActivities || [];
  const week = operator?.week;

  const openList = (params: Record<string, string> = {}) => {
    const query = new URLSearchParams({ view: 'all', ...params });
    if (search.trim()) query.set('search', search.trim());
    router.push(`/dashboard/fazhi?${query.toString()}`);
  };

  const openDetail = (id: number) => router.push(`/dashboard/fazhi/${id}`);

  const downloadResult = async (row: any) => {
    if (!row.completedAttachmentId) {
      message.info('该法旨暂未找到可下载的设计完成稿');
      return;
    }
    setDownloadingId(row.completedAttachmentId);
    try {
      const response = await attachmentApi.download(row.completedAttachmentId);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = row.completedAttachmentName || `${row.serialNumber}-设计完成稿`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      message.error(getErrorMessage(requestError, '下载设计完成稿失败'));
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading && !operator) {
    return <div className={styles.loading}><Skeleton active paragraph={{ rows: 14 }} /></div>;
  }

  if (!operator) {
    return (
      <div className={styles.empty}>
        <Empty description={error || '运营工作台数据暂时无法加载'}>
          <Button onClick={() => onRefresh()}>重新加载</Button>
        </Empty>
      </div>
    );
  }

  const stateCards = [
    ['待主管审批', summary.pendingOperationsApprovalCount, { view: 'pendingOperationsApproval' }],
    ['制作中', summary.inProductionCount, { view: 'inProduction' }],
    ['设计已完成', summary.designCompletedCount, { view: 'designCompleted' }],
    ['退回补充', summary.returnedForSupplementCount, { view: 'returnedForSupplement' }],
  ];

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1>运营工作台</h1>
          <p>{user?.displayName || user?.username || '运营'} · 当前身份：{user?.organizationIdentity === 'GROUP_LEADER' ? '运营组长' : '普通运营'}</p>
          <span>{week?.weekStart && week?.displayWeekEnd ? `${week.weekStart}—${week.displayWeekEnd}` : '周数据暂时无法加载'} · 跟进我提交的法旨与设计进度</span>
        </div>
        <div className={styles.headerTools}>
          <Input.Search
            aria-label="搜索我的法旨"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onSearch={() => openList()}
            placeholder="搜索法旨、产品或店铺"
            enterButton={false}
          />
          <Button icon={<PlusOutlined />} type="primary" onClick={() => router.push('/dashboard/fazhi/new')}>新建法旨</Button>
        </div>
      </header>

      {error && <div className={styles.errorNotice}>数据刷新失败，当前展示最近一次成功数据。{error}</div>}

      <section className={styles.topGrid}>
        <article className={styles.darkCard}>
          <div className={styles.darkPrimary}>
            <h2>处理中法旨</h2>
            <div className={styles.darkNumber}>{summary.processingDecreeCount}<small>条</small></div>
            <div className={styles.darkFooter}>
              <span>今日新增 <b>{summary.createdTodayCount} 条</b></span>
              <span>本周新增 <b>{summary.createdThisWeekCount} 条</b></span>
            </div>
          </div>
          <div className={styles.darkMetrics}>
            {stateCards.map(([label, value, params]: any) => (
              <button key={label} type="button" onClick={() => openList(params)}>
                <span>{label}</span><b>{value}</b>
              </button>
            ))}
          </div>
        </article>

        <article className={styles.overviewCard}>
          <div className={styles.cardTitle}>
            <div><h2>本周需求概览</h2><span>仅统计我本周新建及流转的真实法旨</span></div>
            <span className={styles.dataHint}>数据库实时聚合</span>
          </div>
          <div className={styles.overviewMetrics}>
            <div><b>{summary.createdThisWeekCount}</b><span>本周新建法旨</span></div>
            <div><b>{overview.totalImageCount}</b><span>本周有效图片</span></div>
            <div><b>{overview.approvedImageCount}</b><span>本周设计已完成图片</span></div>
            <div><b>{overview.processingImageCount}</b><span>仍在处理中图片</span></div>
            <div><b>{overview.decreeCount}</b><span>本周涉及法旨</span></div>
          </div>
          <div className={styles.cardActions}>
            <Button type="primary" onClick={() => router.push('/dashboard/fazhi/new')}>新建法旨</Button>
            <Button onClick={() => openList({ createdRange: 'thisWeek' })}>查看本周法旨</Button>
          </div>
        </article>
      </section>

      <article className={styles.progressCard}>
        <div className={styles.cardTitle}>
          <div><h2>当前需求进度</h2><span>仅显示当前仍在流转的已提交法旨，按最近更新时间排序</span></div>
          <Button type="link" onClick={() => openList({ view: 'processing' })}>查看处理中</Button>
        </div>
        <div className={styles.progressTable}>
          <div className={styles.progressHead}>
            <span>法旨编号</span><span>产品编号</span><span>店铺</span><span>需求类型</span><span>当前设计师</span><span>当前进度</span><span>完成图片</span><span>完成比例</span><span>最近更新</span><span>操作</span>
          </div>
          {progressRows.map((row: any) => (
            <div className={styles.progressRow} key={row.id}>
              <b>{row.serialNumber}</b><span>{row.productCode}</span><span>{row.storeName}</span><span>{row.requirementType}</span><span>{row.currentDesigner}</span><Tag color={progressTone[row.progress]}>{row.progress}</Tag><span>{row.approvedImageCount} / {row.effectiveImageCount}</span><span className={styles.inlineProgress}><Progress percent={row.completionRate || 0} showInfo={false} strokeColor="#111" trailColor="#dedede" /><b>{row.completionRate === null ? '-' : `${row.completionRate}%`}</b></span><span>{formatTime(row.updatedAt)}</span><Button size="small" onClick={() => openDetail(row.id)}>查看详情</Button>
            </div>
          ))}
          {!progressRows.length && <div className={styles.emptyRow}>暂无当前需要跟进的已提交法旨</div>}
        </div>
      </article>

      <section className={styles.bottomGrid}>
        <article className={styles.listCard}>
          <div className={styles.cardTitle}><div><h2>设计已完成</h2><span>设计主管审核通过，不代表业务最终完成</span></div><Button type="link" onClick={() => openList({ view: 'designCompleted' })}>查看全部</Button></div>
          <div className={styles.listTable}>
            <div className={styles.completedHead}><span>法旨编号</span><span>产品编号</span><span>店铺</span><span>需求类型</span><span>图片数量</span><span>设计完成时间</span><span>操作</span></div>
            {completedRows.map((row: any) => <div className={styles.completedRow} key={row.id}><b>{row.serialNumber}</b><span>{row.productCode}</span><span>{row.storeName}</span><span>{row.requirementType}</span><span>{row.effectiveImageCount} 张</span><span>{formatTime(row.designCompletedAt)}</span><span className={styles.rowActions}><Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(row.id)}>查看成果</Button><Button size="small" icon={<DownloadOutlined />} loading={downloadingId === row.completedAttachmentId} onClick={() => downloadResult(row)}>下载附件</Button></span></div>)}
            {!completedRows.length && <div className={styles.emptyRow}>暂无设计已完成的法旨</div>}
          </div>
        </article>

        <article className={styles.listCard}>
          <div className={styles.cardTitle}><div><h2>退回补充</h2><span>仅显示需要我补充资料并重新提交的法旨</span></div><Button type="link" onClick={() => openList({ view: 'returnedForSupplement' })}>查看全部</Button></div>
          <div className={styles.listTable}>
            <div className={styles.returnedHead}><span>法旨编号</span><span>产品编号</span><span>店铺</span><span>退回原因摘要</span><span>退回人</span><span>退回时间</span><span>当前缺失资料</span><span>操作</span></div>
            {returnedRows.map((row: any) => <div className={styles.returnedRow} key={row.id}><b>{row.serialNumber}</b><span>{row.productCode}</span><span>{row.storeName}</span><span title={row.latestReturnReason || ''}>{row.latestReturnReason || '-'}</span><span>{row.returnedBy || '-'}</span><span>{formatTime(row.returnedAt)}</span><span>{row.missingMaterials || '-'}</span><span className={styles.rowActions}><Button size="small" onClick={() => openDetail(row.id)}>查看原因</Button><Button size="small" type="primary" onClick={() => openDetail(row.id)}>补充资料</Button></span></div>)}
            {!returnedRows.length && <div className={styles.emptyRow}>暂无需要补充的法旨</div>}
          </div>
        </article>
      </section>

      <article className={styles.activityCard}>
        <div className={styles.cardTitle}><div><h2>最近动态</h2><span>仅展示我创建法旨的真实流转记录</span></div></div>
        <div className={styles.activityList}>
          {activities.map((item: any) => <button type="button" key={item.id} onClick={() => openDetail(item.decreeId)}><span>{formatTime(item.createdAt)}</span><b>{item.label}</b><span>{item.decreeNo}</span></button>)}
          {!activities.length && <div className={styles.emptyRow}>暂无最近动态</div>}
        </div>
      </article>
    </div>
  );
}
