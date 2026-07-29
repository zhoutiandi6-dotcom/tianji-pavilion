import {
  formatShanghaiDate,
  getPreviousShanghaiWeekRange,
  getShanghaiDayRange,
  getShanghaiWeekRange,
  getShanghaiWeekRangeForWeekStart,
} from "./shanghai-time";

describe("Shanghai time ranges", () => {
  it("uses Shanghai midnight when UTC is still on the previous day", () => {
    const range = getShanghaiDayRange(new Date("2026-07-13T16:30:00.000Z"));
    expect(range.start.toISOString()).toBe("2026-07-13T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-07-14T16:00:00.000Z");
  });

  it("starts a Shanghai week on Monday", () => {
    const range = getShanghaiWeekRange(new Date("2026-07-13T04:00:00.000Z"));
    expect(range.start.toISOString()).toBe("2026-07-12T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-07-19T16:00:00.000Z");
  });

  it("keeps Sunday inside the current Shanghai week", () => {
    const range = getShanghaiWeekRange(new Date("2026-07-19T12:00:00.000Z"));
    expect(range.start.toISOString()).toBe("2026-07-12T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-07-19T16:00:00.000Z");
  });

  it("handles month and year boundaries", () => {
    const range = getShanghaiWeekRange(new Date("2026-01-01T02:00:00.000Z"));
    expect(range.start.toISOString()).toBe("2025-12-28T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-01-04T16:00:00.000Z");
  });

  it("returns the previous complete Shanghai week", () => {
    const range = getPreviousShanghaiWeekRange(new Date("2026-07-14T02:00:00.000Z"));
    expect(range.start.toISOString()).toBe("2026-07-05T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-07-12T16:00:00.000Z");
  });

  it("accepts only a Shanghai Monday in YYYY-MM-DD format as a public week identifier", () => {
    const range = getShanghaiWeekRangeForWeekStart("2026-07-27");
    expect(range).not.toBeNull();
    expect(formatShanghaiDate(range!.start)).toBe("2026-07-27");
    expect(getShanghaiWeekRangeForWeekStart("2026-07-28")).toBeNull();
    expect(getShanghaiWeekRangeForWeekStart("2026-07-26T16:00:00.000Z")).toBeNull();
  });

  it("rejects absent, empty, ISO and invalid calendar week identifiers without throwing", () => {
    expect(() => getShanghaiWeekRangeForWeekStart(undefined as unknown as string)).not.toThrow();
    expect(getShanghaiWeekRangeForWeekStart(undefined as unknown as string)).toBeNull();
    expect(getShanghaiWeekRangeForWeekStart(null as unknown as string)).toBeNull();
    expect(getShanghaiWeekRangeForWeekStart("")).toBeNull();
    expect(getShanghaiWeekRangeForWeekStart("2026-02-30")).toBeNull();
    expect(getShanghaiWeekRangeForWeekStart("2026-07-27T00:00:00+08:00")).toBeNull();
  });
});
