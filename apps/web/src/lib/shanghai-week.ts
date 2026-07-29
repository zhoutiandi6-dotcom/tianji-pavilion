const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_OFFSETS: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' });
const shanghaiWeekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' });

export type ShanghaiWeekRange = {
  weekStart: string;
  displayWeekEnd: string;
  nextWeekStart: string;
};

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

function formatShanghaiDate(value: Date) {
  return isValidDate(value) ? shanghaiDateFormatter.format(value) : null;
}

/** Parses only YYYY-MM-DD Shanghai Mondays; invalid input never throws. */
export function parseShanghaiWeekStart(value: unknown): ShanghaiWeekRange | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const start = new Date(Date.UTC(year, month - 1, day, 4));
  if (!isValidDate(start) || formatShanghaiDate(start) !== value || shanghaiWeekdayFormatter.format(start) !== 'Mon') return null;

  const displayWeekEnd = formatShanghaiDate(new Date(start.getTime() + 6 * DAY_MS));
  const nextWeekStart = formatShanghaiDate(new Date(start.getTime() + 7 * DAY_MS));
  return displayWeekEnd && nextWeekStart ? { weekStart: value, displayWeekEnd, nextWeekStart } : null;
}

export function getShanghaiWeekStart(value: Date = new Date()) {
  if (!isValidDate(value)) return '';
  const offset = WEEKDAY_OFFSETS[shanghaiWeekdayFormatter.format(value)];
  return offset === undefined ? '' : formatShanghaiDate(new Date(value.getTime() - offset * DAY_MS)) || '';
}

export function shiftShanghaiWeekStart(weekStart: unknown, offsetWeeks: number) {
  const range = parseShanghaiWeekStart(weekStart);
  if (!range || !Number.isInteger(offsetWeeks)) return '';
  const [year, month, day] = range.weekStart.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return '';
  return formatShanghaiDate(new Date(Date.UTC(year, month - 1, day, 4) + offsetWeeks * 7 * DAY_MS)) || '';
}

export function formatShanghaiWeek(weekStart: unknown) {
  const range = parseShanghaiWeekStart(weekStart);
  return range ? `${range.weekStart}—${range.displayWeekEnd}` : null;
}

export function formatShanghaiDateTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  if (!isValidDate(date)) return null;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
