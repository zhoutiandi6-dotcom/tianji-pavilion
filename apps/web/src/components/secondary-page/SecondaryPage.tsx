'use client';

import type { ReactNode } from 'react';
import { Button, Dropdown, Empty, Tag } from 'antd';
import type { ButtonProps, MenuProps } from 'antd';
import styles from './secondary-page.module.css';

type PageAction = ButtonProps & {
  key: string;
  label: ReactNode;
  kind?: 'primary' | 'secondary' | 'danger';
};

const statusMeta: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  SUBMITTED: { label: '待运营主管审批', color: 'warning' },
  OPS_REJECTED: { label: '运营退回补充', color: 'error' },
  OPS_APPROVED: { label: '已审批放行', color: 'processing' },
  PENDING_ASSIGNMENT: { label: '待设计主管分配', color: 'processing' },
  DESIGN_ASSIGNED: { label: '已分配', color: 'blue' },
  IN_DESIGN: { label: '设计中', color: 'processing' },
  DESIGN_REVIEW: { label: '待设计审核', color: 'warning' },
  DESIGN_APPROVED: { label: '设计已完成', color: 'success' },
  NOT_STARTED: { label: '未开始', color: 'blue' },
  IN_PROGRESS: { label: '设计中', color: 'processing' },
  SUBMITTED_FOR_REVIEW: { label: '待设计审核', color: 'warning' },
  REVISION_REQUIRED: { label: '退回修改', color: 'error' },
  APPROVED: { label: '设计已完成', color: 'success' },
  COMPLETED: { label: '设计已完成', color: 'success' },
  CANCELLED: { label: '已取消', color: 'default' },
  UNREAD: { label: '未读', color: 'processing' },
  READ: { label: '已读', color: 'default' },
};

function buttonType(kind?: PageAction['kind']): ButtonProps['type'] {
  return kind === 'primary' ? 'primary' : 'default';
}

export function SecondaryPageShell({ children }: { children: ReactNode }) {
  return <main className={styles.shell}>{children}</main>;
}

export function SecondaryPageHeader({
  title,
  subtitle,
  meta,
  breadcrumb,
  primaryAction,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  breadcrumb?: ReactNode;
  primaryAction?: PageAction;
  actions?: PageAction[];
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.headerCopy}>
        {breadcrumb ? <div className={styles.inlineBreadcrumb}>{breadcrumb}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
        {meta ? <div className={styles.headerMeta}>{meta}</div> : null}
      </div>
      {(primaryAction || actions?.length) ? (
        <ActionBar primaryAction={primaryAction} actions={actions} />
      ) : null}
    </header>
  );
}

export function ActionBar({
  primaryAction,
  actions = [],
  moreItems,
}: {
  primaryAction?: PageAction;
  actions?: PageAction[];
  moreItems?: MenuProps['items'];
}) {
  return (
    <div className={styles.actionBar}>
      {actions.map(({ key, label, kind = 'secondary', ...props }) => (
        <Button key={key} type={buttonType(kind)} danger={kind === 'danger'} {...props}>{label}</Button>
      ))}
      {moreItems?.length ? <Dropdown menu={{ items: moreItems }}><Button>更多操作</Button></Dropdown> : null}
      {primaryAction ? (
        <Button type="primary" {...primaryAction}>{primaryAction.label}</Button>
      ) : null}
    </div>
  );
}

export function FilterCard({ children }: { children: ReactNode }) {
  return <section className={styles.filterCard}>{children}</section>;
}

export function DataTableCard({
  title,
  extra,
  children,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.tableCard}>
      {title || extra ? <div className={styles.sectionHeader}><div>{title ? <h2>{title}</h2> : null}</div>{extra}</div> : null}
      {children}
    </section>
  );
}

export function DetailSection({
  title,
  description,
  extra,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.detailSection}>
      <div className={styles.sectionHeader}>
        <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
        {extra}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function SecondaryStatusTag({ status, label }: { status: string; label?: ReactNode }) {
  const meta = statusMeta[status] || { label: status, color: 'default' };
  return <Tag color={meta.color} className={styles.statusTag}>{label || meta.label}</Tag>;
}

export function SecondaryEmptyState({ description = '暂无数据', action }: { description?: ReactNode; action?: ReactNode }) {
  return <div className={styles.emptyState}><Empty description={description} />{action ? <div className={styles.emptyAction}>{action}</div> : null}</div>;
}

export function SecondaryErrorState({ message, action }: { message: ReactNode; action?: ReactNode }) {
  return <div className={styles.errorState}><strong>数据暂时无法加载</strong><span>{message}</span>{action}</div>;
}
