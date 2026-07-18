const WEEKDAY_OFFSETS: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' });
const shanghaiWeekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' });

export function getShanghaiWeekStart(value: Date = new Date()) {
  const weekday = shanghaiWeekdayFormatter.format(value);
  const offset = WEEKDAY_OFFSETS[weekday] ?? 0;
  return shanghaiDateFormatter.format(new Date(value.getTime() - offset * 24 * 60 * 60 * 1000));
}

export function shiftShanghaiWeekStart(weekStart: string, offsetWeeks: number) {
  const anchor = new Date(`${weekStart}T12:00:00+08:00`);
  return getShanghaiWeekStart(new Date(anchor.getTime() + offsetWeeks * 7 * 24 * 60 * 60 * 1000));
}

export function formatShanghaiWeek(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00+08:00`);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric' });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}
