'use client';

import { useMemo, useState } from 'react';
import { Button, Drawer, Modal, Progress, Tag, message } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { DashboardTrendChart } from '@/components/dashboard-workbench/TrendChart';
import styles from '@/components/design-manager-dashboard/design-manager-dashboard.module.css';
import {
  EXCEPTION_TASKS,
  INITIAL_PENDING_DECREES,
  OPERATION_MANAGER_DASHBOARD_META,
  OPERATION_MANAGER_TREND,
  OPERATION_QUALITY,
  type PendingDecree,
} from './mock-data';

type DetailTarget = PendingDecree | (typeof EXCEPTION_TASKS)[number] | null;
type OperationManagerDashboardProps = {
  user: { displayName?: string | null; username?: string | null; role?: string };
};

const rateFor = (firstPass: number, submitted: number) => submitted ? Math.round((firstPass / submitted) * 100) : 0;

export default function OperationManagerDashboard({ user }: OperationManagerDashboardProps) {
  const [pendingDecrees, setPendingDecrees] = useState(INITIAL_PENDING_DECREES);
  const [approvedCount, setApprovedCount] = useState(38);
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [personTarget, setPersonTarget] = useState<(typeof OPERATION_QUALITY)[number] | null>(null);

  const pendingImages = useMemo(
    () => pendingDecrees.reduce((total, item) => total + item.imageCount, 0) + 17,
    [pendingDecrees],
  );
  const remaining = Math.max(0, 60 - approvedCount);
  const completionRate = Math.round((approvedCount / 60) * 100);

  const approve = (item: PendingDecree) => {
    setPendingDecrees((items) => items.filter(({ id }) => id !== item.id));
    setApprovedCount((count) => Math.min(60, count + item.imageCount));
    setDetailTarget(null);
    message.success(`${item.serialNumber}：预览模式，数据未写入系统。`);
  };

  const returnForSupplement = (item: PendingDecree) => {
    setPendingDecrees((items) => items.filter(({ id }) => id !== item.id));
    setDetailTarget(null);
    message.warning(`${item.serialNumber}：预览模式，数据未写入系统。`);
  };

  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <div>
          <h1>运营主管驾驶舱</h1>
          <p>{OPERATION_MANAGER_DASHBOARD_META.weekLabel} · 当前角色：运营主管</p>
        </div>
        <div className={styles.headerTools}><span>{user.displayName || user.username || '运营主管'} · {OPERATION_MANAGER_DASHBOARD_META.sourceLabel}</span><time>{OPERATION_MANAGER_DASHBOARD_META.dateLabel}</time></div>
      </header>

      <section className={styles.topGrid}>
        <article className={styles.darkCard}>
          <div className={styles.darkPrimary}>
            <h2>待审批放行</h2>
            <div className={styles.darkNumber}>{pendingImages}<small>张</small></div>
            <span style={{ marginTop: 8, color: '#c9c9c9', fontSize: 13 }}>涉及法旨 7 条</span>
            <div className={styles.darkFooter}><span>今日新增 <b>8 张</b></span><span>本周新增 <b>36 张</b></span></div>
          </div>
          <div className={styles.taskMetrics}>
            <div><span>首次提交</span><b>24</b></div>
            <div><span>退回后重提</span><b>8</b></div>
            <div><span>等待超过24小时</span><b>5</b></div>
            <div><span>资料异常</span><b>5</b></div>
          </div>
        </article>

        <article className={styles.planCard}>
          <div className={styles.planTitle}><h2>本周审批放行计划</h2><span>预览模式</span></div>
          <div className={styles.planContent}>
            <div className={styles.planRate}><strong>{completionRate}%</strong><span>本周放行完成率</span></div>
            <div className={styles.planProgress}><b>已审批放行 {approvedCount} / 本周计划 60</b><Progress percent={completionRate} showInfo={false} strokeColor="#111" trailColor="#dedede" /><span>剩余目标 {remaining} 张</span></div>
            <div className={styles.planDetails}><span>周中追加 <b>8 张</b></span><span>已取消 <b>4 张</b></span><span>涉及法旨 <b>7 条</b></span><button type="button" onClick={() => setPlanModalOpen(true)}>管理本周计划</button></div>
          </div>
        </article>
      </section>

      <DashboardTrendChart
        title="上周与本周实际审批放行"
        unitLabel="按天 / 单位：张"
        previousLabel="上周"
        currentLabel="本周"
        data={OPERATION_MANAGER_TREND}
      />

      <article className={styles.designersCard}>
        <div className={styles.cardHeading}><div><h2>运营人员需求质量</h2><span>一次通过率仅用于质量跟踪，不作绩效排名</span></div><span className={styles.dataHint}>预览模式 / 待接真实聚合接口</span></div>
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
          <div className={styles.cardHeading}><h2>待审批法旨</h2><button type="button" onClick={() => message.info('预稿入口：后续接入待我审批列表。')}>查看全部 <span>→</span></button></div>
          <div className={styles.taskTable}>
            <div className={styles.assignmentHead}><span>法旨编号</span><span>店铺</span><span>运营需求人</span><span>产品编号</span><span>有效图片</span><span>最近提交</span><span>操作</span></div>
            {pendingDecrees.slice(0, 5).map((item) => <div className={styles.assignmentRow} key={item.id}>
              <span>{item.serialNumber}</span><span>{item.store}</span><span>{item.requester}</span><span>{item.productCode}</span><span>{item.imageCount} 张</span><span>{item.submittedAt}</span><span style={{ display: 'flex', gap: 6 }}><button type="button" aria-label={`预览 ${item.serialNumber}`} onClick={() => setDetailTarget(item)}><EyeOutlined /></button><button type="button" onClick={() => setDetailTarget(item)}>去审批</button></span>
            </div>)}
          </div>
        </article>

        <article className={styles.listCard}>
          <div className={styles.cardHeading}><h2>异常与退回任务</h2><button type="button" onClick={() => message.info('预稿入口：后续接入异常法旨列表。')}>查看全部 <span>→</span></button></div>
          <div className={styles.taskTable}>
            <div className={styles.reviewHead}><span>状态</span><span>法旨编号</span><span>问题摘要</span><span>运营需求人</span><span>退回/等待</span><span>操作</span></div>
            {EXCEPTION_TASKS.map((item) => <div className={styles.reviewRow} key={item.id}>
              <Tag>异常</Tag><span>{item.serialNumber}</span><span>{item.summary}</span><span>{item.requester}</span><span>{item.status}</span><button type="button" onClick={() => setDetailTarget(item)}>查看</button>
            </div>)}
          </div>
        </article>
      </section>

      <Drawer title="法旨审批详情（预稿）" width={480} open={Boolean(detailTarget)} onClose={() => setDetailTarget(null)}>
        {detailTarget && <>
          <p><strong>法旨编号：</strong>{detailTarget.serialNumber}</p>
          {'store' in detailTarget ? <>
            <p><strong>店铺：</strong>{detailTarget.store}</p><p><strong>有效图片：</strong>{detailTarget.imageCount} 张</p><p><strong>提交说明：</strong>{detailTarget.detail}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}><Button onClick={() => returnForSupplement(detailTarget)}>退回补充</Button><Button type="primary" onClick={() => approve(detailTarget)}>审批放行</Button></div>
          </> : <><p><strong>问题摘要：</strong>{detailTarget.summary}</p><p><strong>运营需求人：</strong>{detailTarget.requester}</p><p><strong>当前状态：</strong>{detailTarget.status}</p></>}
        </>}
      </Drawer>

      <Modal title="管理本周审批放行计划（预览）" open={planModalOpen} onCancel={() => setPlanModalOpen(false)} footer={<Button type="primary" onClick={() => { setPlanModalOpen(false); message.info('预览模式，数据未写入系统。'); }}>确认预览调整</Button>}>
        <p>本周计划：60 张</p><p>已审批放行：{approvedCount} 张</p><p>剩余目标：{remaining} 张</p><p>该弹窗仅演示入口和状态反馈，不会写入正式数据。</p>
      </Modal>

      <Drawer title="运营人员本周法旨摘要（预稿）" width={420} open={Boolean(personTarget)} onClose={() => setPersonTarget(null)}>
        {personTarget && <><p><strong>{personTarget.name}</strong></p><p>本周提交图片：{personTarget.submitted} 张</p><p>一次通过图片：{personTarget.firstPass} 张</p><p>被退回图片：{personTarget.returned} 张</p><p>待补充图片：{personTarget.pending} 张</p><p>一次通过率：{rateFor(personTarget.firstPass, personTarget.submitted)}%</p></>}
      </Drawer>
    </div>
  );
}
