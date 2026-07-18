'use client';

import styles from '@/components/design-manager-dashboard/design-manager-dashboard.module.css';

export type TrendChartData = {
  days: string[];
  previous: number[];
  current: number[];
};

type TrendChartProps = {
  title: string;
  unitLabel: string;
  previousLabel: string;
  currentLabel: string;
  data: TrendChartData;
};

/**
 * Shared dashboard trend card. It deliberately uses the approved design-manager
 * dashboard CSS module so role dashboards remain visually identical.
 */
export function DashboardTrendChart({
  title,
  unitLabel,
  previousLabel,
  currentLabel,
  data,
}: TrendChartProps) {
  const { days, previous, current } = data;
  const max = Math.max(...previous, ...current, 1);
  const tickMax = Math.ceil(max / 10) * 10;
  const ticks = [tickMax, Math.round(tickMax / 2), 0];

  return (
    <article className={styles.trendCard}>
      <div className={styles.cardHeading}>
        <div>
          <h2>{title}</h2>
          <span>{unitLabel}</span>
        </div>
        <div className={styles.legend}>
          <i />{previousLabel} <b />{currentLabel}
        </div>
      </div>
      <div className={styles.chart} aria-label={title}>
        <div className={styles.axis}>{ticks.map((tick) => <span key={tick}>{tick}</span>)}</div>
        <div className={styles.chartBody}>
          <div className={styles.plotArea}>
            {days.map((day, index) => (
              <div className={styles.barGroup} key={day}>
                <span title={`${previousLabel} ${previous[index] ?? 0} 张`} style={{ height: `${((previous[index] ?? 0) / tickMax) * 100}%` }} />
                <b title={`${currentLabel} ${current[index] ?? 0} 张`} style={{ height: `${((current[index] ?? 0) / tickMax) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className={styles.xAxis}>{days.map((day) => <span key={day}>{day}</span>)}</div>
        </div>
      </div>
    </article>
  );
}
