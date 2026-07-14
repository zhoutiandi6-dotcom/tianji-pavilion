const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TimeRange {
  start: Date;
  end: Date;
}

function shanghaiDateParts(now: Date) {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekDay: shifted.getUTCDay(),
  };
}

function shanghaiMidnightUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - SHANGHAI_OFFSET_MS);
}

export function getShanghaiDayRange(now = new Date()): TimeRange {
  const parts = shanghaiDateParts(now);
  const start = shanghaiMidnightUtc(parts.year, parts.month, parts.day);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function getShanghaiWeekRange(now = new Date()): TimeRange {
  const parts = shanghaiDateParts(now);
  const daysFromMonday = (parts.weekDay + 6) % 7;
  const start = shanghaiMidnightUtc(parts.year, parts.month, parts.day - daysFromMonday);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

export function getPreviousShanghaiWeekRange(now = new Date()): TimeRange {
  const current = getShanghaiWeekRange(now);
  return {
    start: new Date(current.start.getTime() - 7 * DAY_MS),
    end: current.start,
  };
}
